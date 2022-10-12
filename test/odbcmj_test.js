// var should = require("should");
var helper = require("node-red-node-test-helper");
var odbcmj = require("../odbcmj.js");

helper.init(require.resolve('node-red'));
const invalidConnectionString = "connectionTest";
describe('odbcmj Node', function () {

  beforeEach(function (done) {
      helper.startServer(done);
  });

  afterEach(function (done) {
      helper.unload();
      helper.stopServer(done);
  });

  it('should be loaded', function (done) {
    var flow = [{ id: "n1", type: "odbcmj", name: "odbcmj" }];
    helper.load(odbcmj, flow, function () {
      var n1 = helper.getNode("n1");
      try {
        n1.should.have.property('name', 'odbcmj');
        done();
      } catch(err) {
        done(err);
      }
    });
  });

  it('should recieve message', function (done) {
    var flow = [
        { id: "n1", type: "odbcmj", name: "odbcmj"},
        { id: "n2", type: "helper", wires:[["n1"]] }
    ];
    helper.load(odbcmj, flow, function () {
      const n2 = helper.getNode("n2");
      const n1 = helper.getNode("n1");
      n1.on("input", function (msg) {
        try {
            msg.should.have.property('payload', 'test');
            done();
        } catch(err) {
            done(err);
        }
      });
      n2.send({ payload: "test" });
    });
  });

  it('should fail if invalid connection string', function (done) {
    var flow = [
        { id: "n1", type: "odbcmj", name: "odbcmj", connection: "configN1" },
        { id: "configN1", type: "ODBC CONFIG", connectionString: invalidConnectionString }
    ];
    helper.load(odbcmj, flow, function () {
        const configN1 = helper.getNode("configN1");
        const n1 = helper.getNode("n1");
        n1.once("call:error", (call) => {
            try {
                const errors = helper.log().args.filter(function(evt) {
                    return evt[0].level === 20;
                });
                errors[0][0].msg.should.have.a.property('message');
                errors[0][0].msg.message.should.startWith("[odbc] Error connecting to the database");
                done();
            } catch(err) {
                done(err);
            }
        });
      n1.receive({ payload: "test" });
    });
  });
});