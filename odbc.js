module.exports = function(RED) {
  const odbcModule = require('odbc');
  const mustache = require('mustache');
  const objPath = require('object-path');
  //----poolConfig is the function associated to the odbc config node.
  function poolConfig(config){
    RED.nodes.createNode(this, config);
    this.config = config;
    this.pool = null;
    this.connecting = false;
    const thick = this.config.syntaxtick;
    const syntax = this.config.syntax;
    delete this.config.syntaxtick;
    delete this.config.syntax;
    //----Check if the user ticked the syntax checker and if so we create a parser object based on the specified syntax.
    this.parser = ((thick) => {
      if(thick){
        const { Parser } = require('node-sql-parser/build/' + syntax);
        return new Parser();
      } else {return null}
    })(thick)    
    //----Converting numeric configuration parameters to integers instead of strings. 
    for (let [key,value] of Object.entries(this.config)){
      if (!isNaN(parseInt(value))) this.config[key] = parseInt(value);
    }
    this.connect = async () => {      
      if (this.pool == null) { //----Request connection pool.
        this.pool = await odbcModule.pool(this.config);
        this.connecting = false;        
      }
      let connection = await this.pool.connect();
      return connection;
    };
    this.on('close', async (removed, done) => {
      if (removed && this?.pool) { await this.pool.close() }  
      done();      
    })
  }
  //----Registering the odbc config node to the poolConfig function.
  RED.nodes.registerType('odbc config', poolConfig);

  //----odbc is the function associated to the odbc node.
  function odbc(config){
    RED.nodes.createNode(this, config);    
    this.config = config;
    //----Retrieving the specific configuration node.    
    
    this.poolNode = RED.nodes.getNode(this.config.connection);
    this.name = this.config.name;

    //The runQuery function handles the actual query to the database using odbc.js.
    this.runQuery = async function(msg, send, done) {
      try {
        this.status({fill:"blue",shape:"dot",text:"querying..."});
        //---If the output object was passed in the msg, it overwrites to output in the config.
        this.config.outputObj = msg?.output || this.config?.outputObj;
        //---Re-fetching queryString here since it can change because of Mustache even if the node itself doesn't change.
        this.queryString = this.config.query;
        if(this.queryString.length){
          //---Testing if all mustache tags were provided.
          for(var parsed of mustache.parse(this.queryString)){
              if(parsed[0] == "name" || parsed[0] == "&"){
                  if(!objPath.has(msg, parsed[1])){
                      this.warn(`mustache parameter "${parsed[1]}" is absent and will render to undefined`);
                  }
              }
          }
          //---Replace the mustaches tags with the appropriate values from the input msg.
          this.queryString = mustache.render(this.queryString, msg);    
        }    
        //----Case were the query is in the message, not in the payload.
        if (msg?.query) this.queryString = msg.query || this.queryString
        //---Handles the case were the received message is a stringified JSON containing a valid query.
        else if (msg?.payload) {
          if (typeof msg.payload == 'string'){
            let payloadJson = null;
            try { payloadJson = JSON.parse(msg.payload) }
            catch (err) {}//---Do nothing, if the payload was not a JSON it will be handled below.
            //----If the payload, which is now equivalent to a non-stringified incoming message, contains a query string.
            if(typeof payloadJson == 'object'){
              if(payloadJson?.query){
                if(typeof payloadJson.query != 'string'){
                  this.status({fill: "red", shape: "ring",text: "Invalid query"});
                  throw new Error("object msg.payload.query must be a string");
                } else {
                  //---A query string coming from an input message as priority over the query defined in Node.
                  this.queryString = payloadJson.query || this.queryString;
                }
              }
            }
          }
        }
        //----Case were the query is in the payload, not in the messsage.
        else if (msg?.payload?.query){
          if(typeof msg.payload.query != 'string'){
            this.status({fill: "red", shape: "ring",text: "Invalid query"});
            throw new Error("object msg.payload.query must be a string");
          } else { this.queryString = msg.payload.query || this.queryString }        
        }
        //----Case were there was no query pased to the node.
        if(!this.queryString){
          this.status({fill: "red", shape: "ring",text: "Invalid query"});
          throw new Error("no query to execute");          
        }
        if(this.queryString.includes('\?') && !msg?.params){
          this.status({fill: "red", shape: "ring",text: "Invalid statement"});
          throw new Error("the query string includes ? markers but no msg.params was provided");          
        }
        else if(this.queryString.includes('\?') && !Array.isArray(msg.params)){
          this.status({fill: "red", shape: "ring",text: "Invalid statement"});
          throw new Error("the query string includes question marks but msg.params is not an array");          
        }
        if(this.queryString.includes('\?')){
          if((this.queryString.match(/\?/g) || []).length != msg.params.length){
            this.status({fill: "red", shape: "ring",text: "Invalid statement"});
            throw new Error("the number of parameters provided doesn't match the number of ? markers");          
          }
        }
        //----Check if the query string is a syntaxically valid SQL query
        if(this.poolNode?.parser){
          let clone = structuredClone(this.queryString);
          try { this.parseSql = this.poolNode.parser.astify(clone) }
          catch (error) {   
            this.status({fill: "red", shape: "ring",text: "Invalid query"});       
            throw new Error("the query failed the sql syntax check");
          }
        }
        //---If no output object was specified.
        if (!this.config.outputObj){
          this.status({fill: "red", shape: "ring",text: "Invalid output field"});
          throw new Error("invalid output object definition");
        }
        //----If the output string contains illegal punctuation.
        const reg = new RegExp('^((?![,;:`\[\]{}+=()!"$%?&*|<>\/^¨`\s]).)*$')
        if (!this.config.outputObj.match(reg)){ 
          this.status({fill: "red", shape: "ring",text: "Invalid output field"});
          throw new Error("invalid output field");        
        }
        //----If ouput string starts or ends with a period (usually because the user left one there inadvertently)
        if (this.config.outputObj.charAt(0) == "." || this.config.outputObj.charAt(this.config.outputObj.length-1) == "."){ 
          this.status({fill: "red", shape: "ring",text: "Invalid output field"});
          throw new Error("invalid output field");
        }
        //---Retrieving one connection from the pool.
        this.connection = null;
        try { this.connection = await this.poolNode.connect() }
        catch (error) {
          this.status({fill: "red", shape: "ring",text: "connection error"});
          throw new Error(error);
        }
        if(!this.connection){
          this.status({fill: "red", shape: "ring",text: "no connection"});
          throw new Error("no connection");
        }
        //----Actual attempt to send the query to the ODBC driver.
        try { 
          const result = await this.connection.query(this.queryString, msg?.params);
          if(result){
            //----Sending the results to the defined dot notation object.
            objPath.set(msg,this.config.outputObj,result);
            if(this?.parseSql) msg.parsedSql = this.parseSql;
            this.status({fill:'blue',shape:'dot',text:'finish'});
            send(msg);            
          } else {
            this.status({fill: "red", shape: "ring",text: "query error"});
            throw new Error("the query returns a falsy");
          }
        } catch (error) {
          this.status({fill: "red", shape: "ring",text: "query error"});
          throw new Error(error);
        }
        finally {
          //----Close the connection.
          await this.connection.close();
        }
        if (done) done();
      } catch (err) {
        if (done) {done(err)} else {this.error(err, msg)}
      }
      
    };
    //----This function runs following an input message.
    this.checkPool = async function(msg, send, done) {
      //----Loops while other nodes are awaiting connections.  See poolConfig.
      try {
        if (this.poolNode.connecting) {
          this.warn("received msg while requesting pool");
          this.status({fill: "yellow", shape: "ring",text: "requesting pool"});
          setTimeout(() => {
            this.checkPool(msg, send, done);
          }, 1000);
          return;
        }
        //----On initialization, the pool will be null. Set connecting to true so that other nodes are immediately blocked, then call runQuery (which will actually do the pool initialization)
        if (this.poolNode.pool == null) this.poolNode.connecting = true;
        //----If a connection is available, run the runQuery function.
        await this.runQuery(msg, send, done);
      } catch (err) {
        this.status({fill: "red",shape: "dot", text: "operation failed"});
        if (done) {done(err)} else {this.error(err, msg)}
      }

    };
    this.on('input', this.checkPool);
    this.on('close', async (done) => {
      if(this?.connection) await this.connection.close();
      done();      
    })
    this.status({fill:'green',shape:'dot',text:'ready'});
  }
    //----Registering the odbc node to the odbc function.
  RED.nodes.registerType("odbc", odbc);
};
