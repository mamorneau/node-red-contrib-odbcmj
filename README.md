# node-red-contrib-odbcmj

A Node Red implementation of odbc.js (https://www.npmjs.com/package/odbc).  This Node allows to make queries to a database through an ODBC connection.  Additionally, parameters can be passed to the SQL query using Mustache syntax.

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

`node-red-contrib-odbc` provides two nodes:

* **`ODBC pool`**: A configuration node for defining your connection string and managing your connections parameters
* **`ODBC query`**: A node for running queries with or without parameters passed using Mustache syntax

### `ODBC pool`

A configuration node that manages connections in an `odbc.Pool` object. [Can take any configuration property recognized by `odbc.pool()`](https://www.npmjs.com/package/odbc#constructor-odbcpoolconnectionstring). The connection pool will initialize the first time a `ODBC query` node or `ODBC pool` node runs.

#### Properties

* (**required**) **`connectionString`**: <`string`>

  An ODBC connection string that defines your DSN and/or connection string options

  Example:
  ```
  DSN=MyDSN;DFT=2;
  ```
* (optional) **`initialSize`**: <`number`>

  The number of connections created in the Pool when it is initialized

* (optional) **`incrementSize`**: <`number`>

  The number of connections that are created when the pool is exhausted

* (optional) **`maxSize`**: <`number`>

  The maximum number of connections allowed in the pool before it won't create any more

* (optional) **`shrinkPool`**: <`boolean`>

  Whether the number of connections should be reduced to `initialSize` when they are returned to the pool

* (optional) **`connectionTimeout`**: <`number`>

  The number of seconds for a connection to remain idle before closing

* (optional) **`loginTimeout`**: <`number`>

  The number of seconds for an attempt to create a connection before returning to the application
