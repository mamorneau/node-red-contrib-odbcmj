module.exports = function(RED) {
  var odbc = require('odbc');
  var mustache = require('mustache');

  function odbcConfig(config) {
    RED.nodes.createNode(this, config);

    this.poolConfig = config;

    let keys = Object.keys(this.poolConfig);
    let key;
    for (let y = 0; y < keys.length; y++){
      key = this.poolConfig[keys[y]];
      this.warn(key);
      this.warn(parseFloat(key) );
      if (!isNaN(key)){
        this.poolConfig[keys[y]] = parseFloat(key);
      }
    }
    this.pool = null;
    this.connecting = false;
    this.warn(this.poolConfig);
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
        message.payload = result;}
      else {
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
        let str = "[\"" + this.outfield.replace(".", "\",\"") + "\"]";
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


        let outObj = result;
        for (let i = adrArray.length -1; i >= 0; i--){
          outObj = {[adrArray[i]]:outObj};
        }
        message = {...message, ...outObj};
      }

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
