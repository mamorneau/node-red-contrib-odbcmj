module.exports = function(RED) {
  //----Required modules
  var odbc = require('odbc');
  var mustache = require('mustache');

  //----This function creates a JSON structure based on keys passed in an array.  The init value is associated to the last key.
  //----This function is needed later on.
  function appendobj(objarray, init){
    if (objarray.length == 1){
      return {[objarray[0]]:init};
    } else {
      return {[objarray.shift()]:appendobj(objarray, init)};
    }
  }

  //----odbcConfig is the function associated to the ODBC CONFIG node.
  function odbcConfig(config) {
    RED.nodes.createNode(this, config);

    this.poolConfig = config;
    //----Check if the user ticked the syntax checker and if so we create a parser object based on the specified syntax.
    if (this.poolConfig.syntaxtick){
      var { Parser } = require('node-sql-parser/build/' + this.poolConfig.syntax);
      const sql = new Parser();
    }

    //----Converting numeric configuration parameters to actual number instead of string.  String-based numbers not yet tested with odbc.js.
    //----ToDo: Test to veridy that we can remove this.
    let keys = Object.keys(this.poolConfig);
    let val;
    for (let key in keys){
      val = this.poolConfig[keys[key]];
      if (!isNaN(val)){
        this.poolConfig[keys[key]] = parseFloat(val);
      }
    }

    this.pool = null;
    this.connecting = false;

    this.connect = async () => {
      let connection;
      //----Request connection pool.
      if (this.pool == null) {
        try {
          this.pool = await odbc.pool(this.poolConfig);
          this.connecting = false;
        } catch (error) {
          throw(error);
        }
      }
      //----Request connection.
      try {
        connection = await this.pool.connect();
      } catch (error) {
        throw(error);
      }
      return connection;
    };
  }
  //----Registering the ODBC CONFIG node to the odbcConfig function.
  RED.nodes.registerType('ODBC CONFIG', odbcConfig);


  //----odbcmj is the function associated to the odbcmj node.
  function odbcmj(config) {
    RED.nodes.createNode(this, config);
    //----Retrieves the specific configuratio node.
    this.syntaxtick = config.syntaxtick;
    this.poolNode = RED.nodes.getNode(config.connection);
    this.outfield = config.outfield;
    this.name = config.name;




    //The runQuery function handles the actual query to the database using odbc.js.  It also does a few verifications and transforms the reply from the database.
    this.runQuery = async function(message, send, done) {
      let connection;
      //---Retrieving one connection from the pool.
      try {
        connection = await this.poolNode.connect();}
      catch (error) {
        if (error) {
          this.error(error);
          if (done) {done(error);}
          return;
        }
      }
      //---Changing node status.
      this.status({
        fill:"blue",
        shape:"dot",
        text:"querying..."
      });

      let result;
      let error;

      //---Re-fetching queryString here since it can change because of Mustache even if the node itself doesn't change.
      this.queryString = config.query;
      //---Replace the mustaches tags with the appropriate values from the input message.
      this.queryString = mustache.render(this.queryString, message);
      //---Handles the case were the received message is a stringified JSON containing a valid query.
      if (message.payload) {
        if (typeof message.payload == 'string'){
          let payloadJSON;
          try {
            payloadJSON = JSON.parse(message.payload);}
          catch (error) {
            //---Do nothing, if the payload was not a JSON it will be handled below.
          }
          //----If the payload, which is now equivalent to a non-stringified incoming message, contains a query string.
          if(typeof payloadJSON == 'object'){
            if(payloadJSON.query){
              if(typeof payloadJSON.query != 'string'){
                this.error("Error. Object msg.query must be a string.");
                connection.close();
                return;
              } else {
                //---A query string coming from an input message as priority over the query defined in Node.
                this.queryString = payloadJSON.query || this.queryString;
              }
            }
          }
        }
      }
      //----Case were the query is in the message, not in the payload.
      else if (message.query) {
        this.queryString = message.query || this.queryString;
      }
      //----Case were the query is in the payload, not in the messsage.
      else if (typeof message.payload == 'object') {
        this.queryString = message.payload.query || this.queryString;
      }
      //----Case were there was no query pased to the node.
      if(!this.queryString){
        error = "Error. The query string is empty.";
        this.status({fill: "red", shape: "ring",text: error});
        this.error(error);
        connection.close();
        return;
      }
      //----Check if the query string is a syntaxically valid SQL query
      if(this.syntaxtick){
        try {
          sql.parse(this.queryString);
        }
        catch (error) {
          this.error(error);
          connection.close();
          this.status({fill: "red", shape: "ring", text: error});
          return;
        }
      }

      //---If no output object was specified.
      if (!this.outfield){
        error = "Error. The output filed must not be empty.";
        this.status({fill: "red", shape: "ring", text: error});
        this.error(error);
        connection.close();
        return;
      }
      //----If output field doesn't contain a string.
      if (typeof this.outfield != 'string'){
        error = "Error. The output field must be a string.";
        this.status({fill: "red", shape: "ring", text: error});
        this.error(error);
        connection.close();
        return;
      }
      //----If the output string contains illegal punctuation.
      if (this.outfield.search(",") != -1  || this.outfield.search("'") != -1  || this.outfield.search(":") != -1 || this.outfield.search(";") != -1){
        error = "The output string contains a punctuation error.";
        this.error(error);
        this.status({fill: "red", shape: "ring", text: error});
        connection.close();
        return;
      }
      //----If ouput string starts or ends with a period (usually because the user left one there inadvertently)
      if (this.outfield.charAt(0) == "." || this.outfield.charAt(this.outfield.length-1) == "."){
        error = "The output string shouldn't begin or end with a period.";
        this.error(error);
        this.status({fill: "red", shape: "ring", text: error});
        connection.close();
        return;
      }
      //----Try to parse the output string into an stringified array of strings.
      let outputArray = [];
      try {
        outputArray = this.outfield.split(".");
      } catch (error) {
        this.status({fill: "red", shape: "ring", text: error.message});
        connection.close();
        if (done) {done(error);}
      }

      //----Actual attempt to send the query to the ODBC driver.
      try {
        result = await connection.query(this.queryString);
      } catch (error) {
        this.status({fill: "red", shape: "ring", text: error.message});
        connection.close();
        if (done) {done(error);}
      }
      //----If successful, close the connection.
      connection.close();

      let inputArray = [];
      let sameLevel = 0;

      //----IMPORTANT.  This function will iterate over the result object obtained above and will merge it with the JSON structure of the input message.
      function iterateObject(obj, inputArray, outputArray, result) {
        //----Check if the current object contains a input key that matches an output key at this level of the structure.
        if (typeof(obj[outputArray[sameLevel]]) == "object" && sameLevel < outputArray.length -1 ){
          inputArray.push(outputArray[sameLevel]);
          if(obj[outputArray[sameLevel]].hasOwnProperty(outputArray[sameLevel+1])){
            sameLevel++;
            iterateObject(obj[outputArray[sameLevel -1]], inputArray, outputArray, result);
          }
        } else { //If the next level is not an object or if we have reached the end of the output JSON structure, it means it's time to merge the objects
          let leftover = outputArray.slice();
          for (let g = 0; g < sameLevel; g++){
            if(leftover.length > 0) {leftover.shift();}
          }
          //----If the above returns any key, we generate an actual JSON structure, ending with the result array from the query.
          if(leftover.length > 0){result = appendobj(leftover, result);
            obj[outputArray[sameLevel]] = result[outputArray[sameLevel]];
          } else {
            obj[outputArray[sameLevel]] = result;
          }
        }
      }


      //----Actually calling the function to process the original result and sending the computed message.
      iterateObject(message, inputArray, outputArray, result);
      send(message);
      connection.close();
      this.status({fill:'blue',shape:'dot',text:'finish'});
      if (done) {
        done();
      }
    };


    //----This function runs following an input message.
    this.checkPool = async function(message, send, done) {

      //----Loops while other nodes are awaiting connections.  See odbcConfig.
      if (this.poolNode.connecting) {
        setTimeout(() => {
          this.checkPool(message, send, done);
        }, 1000);
        return;
      }

      //----On initialization, the pool will be null. Set connecting to true so that other nodes are immediately blocked, then call runQuery (which will actually do the pool initialization)
      if (this.poolNode.pool == null) {
        this.poolNode.connecting = true;
      }
      //----If a connection is available, run the runQuery function.
      await this.runQuery(message, send, done);
    };

    this.on('input', this.checkPool);
    this.status({fill:'green',shape:'dot',text:'ready'});

  }

    //----Registering the odbcmj node to the odbcmj function.
  RED.nodes.registerType("odbcmj", odbcmj);
};
