# node-red-contrib-odbcmj

A Node Red implementation of odbc.js (https://www.npmjs.com/package/odbc).  This Node allows to make queries to a database through an ODBC connection.  Additionally, parameters can be passed to the SQL query using Mustache syntax or prepared statements.

---
## Acknowledgement

This node is an unofficial fork of node-red-contrib-odbc from Mark Irish (https://github.com/markdirish/node-red-contrib-odbc) and vastly inspires from it.  It also takes ideas from node-red-contrib-odbc2 from AIS Automation (https://github.com/AISAutomation/node-red-contrib-odbc2).  Overall changes:

  - Can use mustache as well as a parameter array.
  - Warnings when mustache will render an undefined variable.
  - Fixes the output field option so that nested object can be used.
  - Fixes the checkbox for the pool shrink option.
  - Uses ace/mode/sql for the SQL input field.
  - Connection nodes can have individually defined names
  - Selectable SQL syntax checker 


## Installation

This package is not available from within the Node Red palette tool.  Instead, in your Node-RED user directory (usually ~/.node-red/), download through the `npm` utility:
    ```
    npm install node-red-contrib-odbcmj
    ```

For the `odbc` connector requirements, please see [the documentation for that package](https://www.npmjs.com/package/odbc#requirements).


## Usage

`node-red-contrib-odbcmj` provides two nodes:

* **`odbc config`**: A configuration node for defining your connection string and managing your connection parameters

* **`odbc`**: A node for running queries with or without parameters passed using Mustache syntax or using a parameter array.


### `odbc config`

A configuration node that manages connections in an `odbc.pool` object. [Can take any configuration property recognized by `odbc.pool()`](https://www.npmjs.com/package/odbc#constructor-odbcpoolconnectionstring). The connection pool will initialize the first time an `odbc` node receives an input message.

#### Properties

* (**required**) **`connectionString`**: <`string`>

  An ODBC connection string that defines your DSN and/or connection string options.  Check your ODBC driver documentation for more information about valid connection strings.

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

* (optional) **`syntaxChecker`**: <`boolean`>

  Whether the syntax validator is activeted or not. If activated, the query string will be [parsed](https://www.npmjs.com/package/node-sql-parser#create-ast-for-sql-statement) and appended as an object to the output message with a key named `parsedSql`.  Default: false.

* (optional) **`syntax`**: <`string`>

  Dropdown list of the available [SQL flavors available](https://www.npmjs.com/package/node-sql-parser#supported-database-sql-syntax). Default: mysql.

### `odbc`

A node that runs a query when input is received. Each instance of the node can define its own query string, as well as take a query and/or parameters as input. A query sent as an input message will override any query defined in the node properties.

#### Properties

* (**required**) **`connection`**: <`odbc config`>

  The ODBC pool node that defines the connection settings and manages the connection pool used by this node.

* (optional) **`query`**: <`string`>

  A valid SQL query string that can optionally contains parameters inserted using the Mustache syntax.  For exemple, msg.payload can be inserted anywhere in the string using triple curly brackets: `{{{payload}}}`.  The node will accept a query that is passed either as msg.query, msg.payload.query or msg.payload if payload is a stringified JSON containing a query key/value pair.  A query string passed from the input will override any query defined in the node properties.  Mustache syntax cannot be used with a query string passed from the input.

  Alternatively, the query string can be constructed as a prepared statement; that is with variables replaced by question marks: `SELECT * FROM test WHERE id = ?`.  The variables must then be passed to the input using `msg.parameters`.  This object must be an array containing the same number of element that there are `?` in the query string.  The parameters are inserted one by one, from left to right.

* (**required**) **`result to`**: <`dot-notation string`>

  The JSON nested element structure that will contain the result output.  The string must be a valid JSON object structure using dot-notation, minus the `msg.` (ex: `payload.results`) and must not start or end with a period.  Square braquet notation is not allowed.  The node input object is carried out to the output, as long as the output object name does not conflict it.  If the targeted output JSON object was already present in the input, the result from the query will be appended to it if it was itself an object (but not an array), otherwise the original key/value pair will be overwritten.

  Example:

    - `input msg:   {"payload": {"result": {"othervalue": 10} } };`

    - `result to:  payload.results.values`

    In this case, `values` will be appended to `result` wihout overwriting `othervalue`.  If `result` had been a string, then it would have replaced by `values`.

#### Inputs

The `odbc` node accepts a message input that is either:

  - a `payload` that contains a valid JSON string which itself contains a nested `query` key/value pair where the value is the SQL string. Ex: `msg.payload = "{'query':'<sql string>'}"`
  - a `payload` object with a nested `query` key/value pair where the value is the SQL string. Ex: `msg.payload.query = '<sql string>'`
  - a `query` key/value pair where the value is the SQL string. Ex: `msg.query = '<sql string>'`

* (optional) **`parameters`** <`array`>:

An array containing the same number of element that there are `?` in the query string.  The array is optionnal only if there are no variables markers in the query string.

#### Outputs

Returns a message containing an `output object` matching the `result to` dot-notation string as described above.

* **`output object`**: <`array`>

  The [`odbc` result array](https://www.npmjs.com/package/odbc#result-array) returned from the query.

* **`odbc`**: <`object`>

  Contains any key/value pairs that were in the original output and were the key was not an integer.  The module odbc.js returns a [few useful parameters](https://www.npmjs.com/package/odbc#result-array) but these parameters are not part of the output array and are thus segregated into `msg.odbc`.  This is to avoid potential issues if looping through the output array using `Object.entries`.