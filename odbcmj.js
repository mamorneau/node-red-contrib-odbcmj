module.exports = function(RED) {
  var odbc = require('odbc');
  var mustache = require('mustache');
  //const process = require('process');

  function odbcConfig(config) {
    RED.nodes.createNode(this, config);

    // Pass a poolConfig object to the odbc.pool function. If the values are not
    // set on the config object, they will get set to `undefined`, in which case
    // odbc.pool will set them to the defaults during its execution.
    this.poolConfig = config;
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
          this.status({fill: "red", shape: "ring", text: error.message});
          if (done) {
            // Node-RED 1.0 compatible
            done(error);
          } else {
            // Node-RED 0.x compatible
            node.error(error, message);
          }
        }
      }

      this.status({
        fill:"blue",
        shape:"dot",
        text:"querying..."
      });

      let parameters = undefined;
      let result;

      if (message.payload) {

        // If the payload is a string, convert to JSON object and get the query
        // and/or parameters
        if (typeof message.payload == 'string')
        {
          let payloadJSON;
          try {
            // string MUST be valid JSON, else fill with error.
            // TODO: throw error?
            payloadJSON = JSON.parse(message.payload);
          } catch (error) {
            this.status({fill: "red", shape: "ring", text: error.message});
            connection.close();
            if (done) {
              // Node-RED 1.0 compatible
              done(error);
            } else {
              // Node-RED 0.x compatible
              node.error(error, message);
            }
          }
          parameters = payloadJSON.parameters || this.parameters;
          this.queryString = payloadJSON.query || this.queryString;
        }

        // If the payload is an object, get the query and/or parameters directly
        // from the object
        else if (typeof message.payload == 'object') {
          parameters = message.payload.parameters || this.parameters;
          this.queryString = message.payload.query || this.queryString;
        }
      }

      try {
        result = await connection.query(this.queryString, parameters);
      } catch (error) {
        this.error(error);
        this.status({fill: "red", shape: "ring", text: error.message});
        connection.close();
        if (done) {
          // Node-RED 1.0 compatible
          done(error);
        } else {
          // Node-RED 0.x compatible
          node.error(error, message);
        }
      }

      connection.close();
      if (!this.outfield){
        message.payload = result;}
      else {
        if (this.outfield.search(",") != -1 || this.outfield.search(".") != -1 this.outfield.search(":") != -1 this.outfield.search(";") != -1){
          node.error("The output string contains a punctuation error.");
          return;}
        if (this.outfield.charAt(0) == "." || this.outfield.charAt(this.outfield.length-1) == "."){
          node.error("The output string shouldn't begin or end with a period.");
          return;}
        let str = "[" + this.outfield.replace(/./g, ",") + "]";
        let adrArray = JSON.parse(str);
        let outObj = result;
        for (let i = adrArray.length -1; i >= 0; i++){
          outObj = {adrArray[i]:outObj};
        }
        message = outObj;      }
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
