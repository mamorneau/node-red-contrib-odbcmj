module.exports = function(RED) {
  var odbc = require('odbc');
  var mustache = require('mustache');



  function odbcConfig(config) {
    RED.nodes.createNode(this, config);

    this.poolConfig = config;

    let keys = Object.keys(this.poolConfig);
    let val;
    for (let y = 0; y < keys.length; y++){
      val = this.poolConfig[keys[y]];
      if (!isNaN(val)){
        this.poolConfig[keys[y]] = parseFloat(val);
      }
    }
    this.pool = null;
    this.connecting = false;
    this.connect = async () => {

      let connection;

      if (this.pool == null) {
        try {
          this.pool = await odbc.pool(this.poolConfig);
          this.connecting = false;
        } catch (error) {
          throw(error);
        }
      }

      try {
        connection = await this.pool.connect();
      } catch (error) {
        throw(error);
      }

      return connection;
    }
  }

  RED.nodes.registerType('ODBC CONFIG', odbcConfig);

  function odbcmj(config) {
    RED.nodes.createNode(this, config);
    this.poolNode = RED.nodes.getNode(config.connection);
    this.queryString = config.query;
    this.parameters = config.parameters;
    this.outfield = config.outField;
    this.name = config.name;
    this.runQuery = async function(message, send, done) {
      let connection;
      try {
        connection = await this.poolNode.connect();
      } catch (error) {
        if (error) {
          this.error(error);
          if (done) {
            // Node-RED 1.0 compatible
            done(error);
          } else {
            // Node-RED 0.x compatible
            this.error(error, message);
          }
        }
      }

      this.status({
        fill:"blue",
        shape:"dot",
        text:"querying..."
      });

      let parameters;
      let result;

      this.queryString = mustache.render(this.queryString, message);

      if (message.payload) {
        if (typeof message.payload == 'string'){
          let payloadJSON;
          try {
            payloadJSON = JSON.parse(message.payload);
          } catch (error) {
            this.status({fill: "red", shape: "ring", text: error.message});
            connection.close();
            if (done) {
              // Node-RED 1.0 compatible
              done(error);
            } else {
              // Node-RED 0.x compatible
              this.error(error, message);
            }
          }
          if(payloadJSON.query){
            if(typeof payloadJSON.query != 'string'){
              this.error("Error. Object msg.query must be a string.");
              connection.close();
              return;
            }
          }
          this.queryString = payloadJSON.query || this.queryString;
        }

        // If the payload is an object, get the query and/or parameters directly
        // from the object
        else if (typeof message.payload == 'object') {
          this.queryString = message.payload.query || this.queryString;
        }
      }

      if(!this.queryString){
        error = "Error. The query string is empty.";
        this.status({fill: "red", shape: "ring",text: error});
        this.error(error);
        connection.close();
        return;
      }

      try {
        result = await connection.query(this.queryString);
      } catch (error) {
        this.error(error);
        this.status({fill: "red", shape: "ring", text: error.message});
        connection.close();
        if (done) {
          // Node-RED 1.0 compatible
          done(error);
        } else {
          // Node-RED 0.x compatible
          this.error(error, message);
        }
      }
      connection.close();

      let adrArray = [];
      if (!this.outfield){
        error = "Error. The output filed must not be empty."
        this.status({fill: "red", shape: "ring", text: error});
        this.error(error);
        connection.close();
        return;}
        if(typeof this.outfield != 'string'){
          error = "Error. The output field must be a string."
          this.status({fill: "red", shape: "ring", text: error});
          this.error(error);
          connection.close();
          return;
        }
        if (this.outfield.search(",") != -1  || this.outfield.search("'") != -1  || this.outfield.search(":") != -1 || this.outfield.search(";") != -1){
          error = "The output string contains a punctuation error.";
          this.error(error);
          this.status({fill: "red", shape: "ring", text: error});
          connection.close();
          return;}
        if (this.outfield.charAt(0) == "." || this.outfield.charAt(this.outfield.length-1) == "."){
          error = "The output string shouldn't begin or end with a period.";
          this.error(error);
          this.status({fill: "red", shape: "ring", text: error});
          connection.close();
          return;}
        let str = "[\"" + this.outfield.replaceAll(".", "\",\"") + "\"]";
        try {
          adrArray = JSON.parse(str);
        } catch (error) {
          this.status({fill: "red", shape: "ring", text: error.message});
          connection.close();
          if (done) {
            // Node-RED 1.0 compatible
            done(error);
          } else {
            // Node-RED 0.x compatible
            this.error(error, message);
          }
        }

        let inputArray = [];
        let samelevel = 0;


        function appendobj(objarray, init){
            if (objarray.length == 1){
              return {[objarray[0]]:init}
            } else {
              return {[objarray.shift()]:appendobj(objarray, init)};
            }
        }


        function iterateObject(obj, inputArray, adrArray, result) {
          let gotone = false;
          let inchild = false;
          let keys = Object.keys(obj);
          for(let z = 0; z < keys.length && !gotone; z++) {
            let childobj = obj[keys[z]];
            let childkey = keys[z];
            if (adrArray[samelevel] == childkey){
              gotone = true;
              inputArray.push(childkey);
              samelevel++;
              if (typeof(thisobj) == "object"){
                inchild = iterateObject(childobj, inputArray, adrArray, result);
              }
            }
          }
          if(!inchild){
            let leftover = adrArray.slice();
            for (let g = 0; g < samelevel; g++){
              if(leftover.length > 0) {leftover.shift()}
            }
            if(leftover.length > 0){result = appendobj(leftover, result);}
            if (samelevel == 0){
              obj[Object.keys(result)[0]] = result[Object.keys(result)[0]];
            }
            else if (typeof(obj[inputArray[samelevel-1]]) == "object" && leftover.length !=0){
              obj[inputArray[samelevel-1]] = {...obj[inputArray[samelevel-1]],...result};
            } else {
              obj[inputArray[samelevel-1]] = result;
            }
          }
          return gotone;
        }

        iterateObject(message, inputArray, adrArray, result);



      send(message);
      connection.close();
      this.status({fill:'green',shape:'dot',text:'ready'});
      if (done) {
        done();
      }
    }

    this.checkPool = async function(message, send, done) {
      if (this.poolNode.connecting) {
        setTimeout(() => {
          this.checkPool(message, send, done);
        }, 1000);
        return;
      }

      // On initialization, pool will be null. Set connecting to true so that
      // other nodes are immediately blocked, then call runQuery (which will
      // actually do the pool initialization)
      if (this.poolNode.pool == null) {
        this.poolNode.connecting = true;
      }
      await this.runQuery(message, send, done);
    }

    this.on('input', this.checkPool);

    this.status({fill:'green',shape:'dot',text:'ready'});
  }

  RED.nodes.registerType("odbcmj", odbcmj);
}
