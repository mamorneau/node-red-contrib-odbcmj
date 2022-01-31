# node-red-contrib-odbcmj

A Node Red implementation of odbc.js (https://www.npmjs.com/package/odbc).  This Node allows to make queries to a database through an ODBC connection.  Additionally, parameters can be passed to the SQL query using Mustache syntax.

---
## Acknowledgement

This node is an unofficial fork of node-red-contrib-odbc from Mark Irish (https://github.com/markdirish/node-red-contrib-odbc) and vastly inspires from it.  It also takes ideas from node-red-contrib-odbc2 from AIS Automation (https://github.com/AISAutomation/node-red-contrib-odbc2).  Overall changes:

  - Uses mustache instead of a parameter array.
  - Fixes the output field option.
  - Fixes the checkbox for the pool shrink option.
  - Uses ace/mode/sql for the SQL input field.
  - Connection nodes can have individually defined names
  - Selectable SQL syntax checker 

#### This package will not be activaly maintained.  Use it at your own risks.
---
## Installation

There are two ways to download this package:

1. From the Node-RED ediot menu, select `Manage pallete`, then click the `Install` tab and search for this package.

2. In your Node-RED user directory (usually ~/.node-red/), download through the `npm` utility:
    ```
    npm install node-red-contrib-odbcmj
    ```

For the `odbc` connector requirements, please see [the documentation for that package](https://www.npmjs.com/package/odbc#requirements).

---
## Usage

`node-red-contrib-odbcmj` provides two nodes:

* **`ODBC CONFIG`**: A configuration node for defining your connection string and managing your connections parameters

* **`odbcmj`**: A node for running queries with or without parameters passed using Mustache syntax


### `ODBC CONFIG`

A configuration node that manages connections in an `odbc.Pool` object. [Can take any configuration property recognized by `odbc.pool()`](https://www.npmjs.com/package/odbc#constructor-odbcpoolconnectionstring). The connection pool will initialize the first time a `odbcmj` node or `ODBC CONFIG` node runs.

#### Properties

* (**required**) **`connectionString`**: <`string`>

  An ODBC connection string that defines your DSN and/or connection string options

  Example:
  ```
  DSN=MyDSN;DFT=2;
  ```
* (optional) **`initialSize`**: <`number`>

  The number of connections created in the Pool when it is initialized.  Default: 5.

* (optional) **`incrementSize`**: <`number`>

  The number of connections that are created when the pool is exhausted. Default: 5.

* (optional) **`maxSize`**: <`number`>

  The maximum number of connections allowed in the pool before it won't create any more. Default: 15.

* (optional) **`shrinkPool`**: <`boolean`>

  Whether the number of connections should be reduced to `initialSize` when they are returned to the pool. Default: true.

* (optional) **`connectionTimeout`**: <`number`>

  The number of seconds for a connection to remain idle before closing.  Default: 3.

* (optional) **`loginTimeout`**: <`number`>

  The number of seconds for an attempt to create a connection before returning to the application. Default: 3.

### `odbcmj`

A node that runs a query when input is received. This node can define its own query string, as well as take a query and/or parameters as input. A query sent as an input values will override any query defined in the node properties.

#### Properties

* (**required**) **`connection`**: <`ODBC CONFIG`>

  The ODBC pool node that defines the connection settings and manages the connection pool used by this node

* (optional) **`query`**: <`string`>

  A valid SQL query string that can optionally contains parameters inserted using the Mustache syntax.  For exemple, msg.payload can be inserted anywhere in the string using {{{payload}}}.  The node will accept a query that is passed either as msg.query, msg.payload.query or msg.payload if payload is a stringified JSON containing a query object.

* (optional) **`output object`**: <`JSON object name`>

  The JSON structure that will contain the result output.  The string must be a valid JSON object structure (ex: `payload.results`) and must not start or end with a period.  The node input is carried out to the output, as long as the output object name does not conflit it.  If the targeted output JSON object was already present in the input, the result from the query will be appended to it, unless parts of the targeted input message were not object themselves, in which case they will be overwritten.

  Example:

    - `input:   {"payload":
                 {"result":
                   {"othervalue": 10}
                 }
               };`

    - `output:  payload.results.values`

    In this case, `values` will be appended to `result` wihout overwriting `othervalue`.  If `result` had been a string, then it would have became an object and its content would have been lost.

#### Inputs

The `odbcmj` node accepts a `payload` input that is either a valid JSON string or a JavaScript object with `query` properties. This value, when passed on the payload, overrides the query node property.

* (optional) **`payload.query`** <`string`>:

  A valid SQL query string

#### Outputs

Sends a message as an `output object` (as defined above) that is the results from the query

* **`output object`**: <`array`>

  The [`odbc` Result array](https://www.npmjs.com/package/odbc#result-array) returned from the query.
