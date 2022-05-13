# insta-mongo

Instantly start a MongoDB dev server and load database fixtures.

You need [Node.js](https://nodejs.org/) installed to use `insta-mongo`.

## Install it

Install globally:

```bash
npm install -g insta-mongo
```

Install locally to use as a development database for your Node.js project:

```bash
npm install --save-dev insta-mongo
```

## Run it

In your terminal, run it globally:

```bash
insta-mongo
```

Or run it locally:

```bash
npx insta-mongo
```

You now have a MongoDB database server with a REST API to load database fixtures*.

\* A database fixture is a particular named set of test data for your application.

## Integrate it in your Node.js project

To create a dev database that runs while your Node.js application is running use [concurrently](https://www.npmjs.com/package/concurrently).

Your `start` and `start:dev` script in your `package.json` will look something like this:

```json
{
    "scripts": {
        "start": "node index.js",
        "start-db": "insta-mongo"
        "start:dev": "concurrently \"npm run start-db\" \"npm start\" --kill-others"
    }
}
```

Using the flag `--kill-others` will stop the database server when your Node.js application terminates.


## Usage

```bash
[npx] insta-mongo [options]
```

```
Options:

 --db-port=<port-no>            Sets the port for the database server.
                                Defaults to 5001.
 --rest-port=<port-no>          Sets the port for the REST API      
                                Defaults to 5000.
 --db=<database-name>           Sets the database into which to load 
                                the initial fixture.
 --load=<fixture-name>          Loads an initial named database fixture.
 --fixtures=<path-to-fixtures>  Sets the path that contains database fixtures.
                                Defaults to ./fixtures.
```

## Database fixtures:

Place your database fixtures under ./fixtures like this:

```
./fixtures/
    fixture-1/
        collection1.json
        collection2.json
    fixture-2/
        another-collection.js
```

Each JavaScript or JSON file is loaded into it's own collection that is the same as the name of the file.

[See example JavaScript collection here](https://github.com/ashleydavis/insta-mongo/blob/main/fixtures/example-js-fixture/person.js).

[See example JSON collection here](https://github.com/ashleydavis/insta-mongo/tree/main/fixtures/example-json-fixture).

## REST API end points

Hit the following endpoints to load and unload your database fixtures.

Loads a fixture:
  
```
HTTP GET http://localhost:5000/load-fixture?db=<db-name>&fix=<your-fixture-name>
```

Unloads a fixture:

```
HTTP GET http://localhost:5000/unload-fixture?db=<db-name>&fix=<your-fixture-name>
```

Drops a named database collection:

```
HTTP GET http://localhost:5000/drop-collection?db=<db-name>&col=<collection-name>
```

Gets the contents of a collection.

```
HTTP GET http://localhost:5000/get-collection?db=<db-name>&col=<collection-name>
```

[See a VS Code REST Client script that exercises these REST APIs](https://github.com/ashleydavis/insta-mongo/blob/main/test.http).