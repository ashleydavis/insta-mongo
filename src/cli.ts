import { MongoMemoryServer } from 'mongodb-memory-server';
import * as express from "express";
import { Express, Request, Response } from "express";
import { Server } from 'http';
import { AddressInfo } from 'net';
import * as Fixtures from 'node-mongodb-fixtures';
import * as path from "path";
import * as mongodb from "mongodb";
import { MongoClient } from 'mongodb';
import * as minimist from "minimist";

async function main() {

    const argv = minimist(process.argv.slice(2));

    if (argv['?'] || argv.h || argv.help) {
        displayHelp();
        return;
    }

    const mongoPort = argv["db-port"] && parseInt(argv["db-port"]) || 5001;

    const mongod = await MongoMemoryServer.create({
        instance: {
            port: mongoPort,
        },
    });

    const serverUri = mongod.getUri();

    console.log(`MongoDB server running at ${serverUri}`);

    const dbClient = await mongodb.MongoClient.connect(serverUri);

    const app = express();

    const fixturesDirectory = argv.fixtures && path.resolve(argv.fixtures) || path.join(process.cwd(), "fixtures");
    console.log(`\r\nLoading database fixtures from ${fixturesDirectory}`);

    initRoutes(app, dbClient, serverUri, fixturesDirectory);

    const restApiPort = argv["rest-port"] && parseInt(argv["rest-port"]) || 5000;

    await startServer(app, restApiPort);

    console.log(`\r\nREST API running at http://localhost:${restApiPort}`);
    displayRestApiHelp(restApiPort);

    if (argv.load) {
        if (!argv.db) {
            throw new Error(`To load an initial database fixture please use --db=<database-name> to specify which database to load the fixture into.`);
        }

        await loadFixture(serverUri, argv.db, argv.load, fixturesDirectory);
    }
}

main()
    .catch(err => {
        console.error(`insta-mongo failed to start:`);
        console.error(err);
    });

//
// Display help for the user.
//
function displayHelp() {
    console.log(`
Usage:
  
 [npx] insta-mongo [options]

Examples:

 insta-mongo\t\t\tStart an instant MongoDB database and REST API.
 insta-mongo --rest-port=3200\tSet the port of the REST API.
 insta-mongo --db-port=3210\tSet the port of the database server.
 insta-mongo --load=fixture-1\tStart an instant database and load a particular fixture.

Options:

 --db-port=<port-no>\t\tSets the port for the database server (defaults to 5001).
 --rest-port=<port-no>\t\tSets the port for the REST API (defaults to 5000).
 --db=<database-name>\t\tSets the database into which to load the initial fixture.
 --load=<fixture-name>\t\tLoads an initial named database fixture.
 --fixtures=<path-to-fixtures>\tSets the path that contains database fixtures (defaults to ./fixtures).

Database fixtures:

 Place your database fixtures under ./fixtures like this:

 ./fixtures
 \t/fixture-1
 \t\tcollection1.json
 \t\tcollection2.json
 \t/fixture-2
 \t\tanother-collection.json

 Each JSON file is loaded into it's own collection.

Rest API:`);

    displayRestApiHelp(5000);
}

//
// Display help for the REST API.
//
function displayRestApiHelp(restApiPort: number): void {
    console.log(`
 Use the following endpoints to load and unload your database fixtures:
  
 HTTP GET http://localhost:${restApiPort}/load-fixture?db=<db-name>&fix=<your-fixture-name>
 HTTP GET http://localhost:${restApiPort}/unload-fixture?db=<db-name>&fix=<your-fixture-name>
 HTTP GET http://localhost:${restApiPort}/drop-collection?db=<db-name>&col=<collection-name>
 HTTP GET http://localhost:${restApiPort}/get-collection?db=<db-name>&col=<collection-name>
    `);
}

//
// Starts the HTTP server.
//
function startServer(app: Express, port: number): Promise<{
        server: Server,
        host: string,
        port: number,
    }> {
    return new Promise((resolve, reject) => {
        var server = app.listen(port, () => {
            const addrInfo = server.address() as AddressInfo;
            const host = addrInfo.address;
            const port = addrInfo.port;
            resolve({
                server,
                host,
                port
            });
        });
    });
}

//
// Loads a fixture to the database.
//
async function loadFixture(serverUri: string, databaseName: string, fixtureName: string, fixturesDirectory: string) {
    const fixtures = new Fixtures({
        dir: path.join(fixturesDirectory, fixtureName),
        mute: false,
    });

    await fixtures.connect(serverUri + databaseName);
    await fixtures.unload();
    await fixtures.load();
    await fixtures.disconnect();
}

//
// Unloads a fixture from the database.
//
async function unloadFixture(serverUri: string, databaseName: string, fixtureName: string, fixturesDirectory: string) {
    const fixtures = new Fixtures({
        dir: path.join(fixturesDirectory, fixtureName),
        mute: false,
    });

    await fixtures.connect(serverUri + databaseName);
    await fixtures.unload();
    await fixtures.disconnect();
}

//
// Determine if a particular named collection already exists.
//
// Source: https://stackoverflow.com/questions/21023982/how-to-check-if-a-collection-exists-in-mongodb-native-nodejs-driver
//
async function collectionExists(client: mongodb.MongoClient, databaseName: string, collectionName: string) {
    const db = client.db(databaseName);
    const collectionNames = await db.listCollections().toArray();
    return collectionNames.some(collection => collection.name === collectionName);
}

//
// Drop a collection if it exists.
//
async function dropCollection(client: mongodb.MongoClient, databaseName: string, collectionName: string) {
    const collectionAlreadyExists = await collectionExists(client, databaseName, collectionName);
    if (collectionAlreadyExists) {
        const db = client.db(databaseName);
        await db.dropCollection(collectionName);
        console.log("Dropped collection: " + collectionName);
    }
    else {
        console.log("Collection doesn't exist: " + collectionName);
    }
}

//
// Initializes REST API routes.
//
function initRoutes(app: Express, dbClient: MongoClient, serverUri: string, fixturesDirectory: string) {

    //
    // Checks that the API is alive.
    //
    app.get("/is-alive", (req, res) => {
        res.json({
            ok: true,
        });
    });

    function verifyQueryParam(req: Request, res: Response, paramName: string, msg: string): string {
        const param = req.query[paramName];
        if (!param) {
            res.status(400).send(msg);
        }
        return param as string;
    }

    app.get("/load-fixture", async (req, res) => {
        const databaseName = verifyQueryParam(req, res, "db", "Query parameter 'db' specifies database name."); 
        const fixtureName = verifyQueryParam(req, res, "fix", "Query parameter 'fix' specifies name of fixture to load into database."); 
        if (!databaseName || !fixtureName) {
            return;
        }

        try {
            await loadFixture(serverUri, databaseName, fixtureName, fixturesDirectory)

            console.log("Loaded database fixture: " + fixtureName + " to database " + databaseName);
            res.sendStatus(200);
        }
        catch (err: any) {
            const msg = "Failed to load database fixture " + fixtureName + " to database " + databaseName;
            console.error(msg);
            console.error(err && err.stack || err);
            res.status(400).send(msg);
        }
    });

    app.get("/unload-fixture", async (req, res) => {
        const databaseName = verifyQueryParam(req, res, "db", "Query parameter 'db' specifies database name."); 
        const fixtureName = verifyQueryParam(req, res, "fix", "Query parameter 'fix' specifies name of fixture to load into database."); 
        if (!databaseName || !fixtureName) {
            return;
        }

        try {
            await unloadFixture(serverUri, databaseName, fixtureName, fixturesDirectory);

            console.log("Unloaded database fixture: " + fixtureName + " from database " + databaseName);
            res.sendStatus(200);
        }
        catch (err: any) {
            const msg = "Failed to unload database fixture " + fixtureName + " from database " + databaseName;
            console.error(msg);
            console.error(err && err.stack || err);
            res.status(400).send(msg);
        }
    });
    
    app.get("/drop-collection", async (req, res) => {
        const databaseName = verifyQueryParam(req, res, "db", "Query parameter 'db' specifies database name."); 
        const collectionName = verifyQueryParam(req, res, "col", "Query parameter 'col' specifies name of collection to drop."); 
        if (!databaseName || !collectionName) {
            return;
        }

        try {
            await dropCollection(dbClient, databaseName, collectionName);

            console.log(`Dropped collection ${collectionName} from database ${databaseName}`);
            res.sendStatus(200);
        }
        catch (err: any) {
            const msg = "Failed to drop collection " + collectionName + " from database " + databaseName;
            console.error(msg);
            console.error(err && err.stack || err);
            res.status(400).send(msg);
        }
    });

    app.get("/get-collection", async (req, res) => {
        const databaseName = verifyQueryParam(req, res, "db", "Query parameter 'db' specifies database name."); 
        const collectionName = verifyQueryParam(req, res, "col", "Query parameter 'col' specifies name of collection to drop."); 
        if (!databaseName || !collectionName) {
            return;
        }

        try {
            const db = dbClient.db(databaseName);
            const documents = await db.collection(collectionName).find().toArray();
            res.json(documents);
        }
        catch (err: any) {
            const msg = "Failed to get collection " + collectionName + " from database " + databaseName;
            console.error(msg);
            console.error(err && err.stack || err);
            res.status(400).send(msg);
        }
    });

}