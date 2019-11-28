import { MongoClient, ObjectID } from "mongodb";
import { GraphQLServer } from 'graphql-yoga'
import * as uuid from 'uuid'

import "babel-polyfill"

const usr = "dharoy";
const pwd = "1qaz2wsx3edc";
const url = "cluster1-zxbet.mongodb.net/test?retryWrites=true&w=majority";


/**
 * Connects to MongoDB Server and returns connected client
 * @param {string} usr MongoDB Server user
 * @param {string} pwd MongoDB Server pwd
 * @param {string} url MongoDB Server url
 */

const connectToDb = async function (usr, pwd, url) {
    const uri = `mongodb+srv://${usr}:${pwd}@${url}`;
    const client = new MongoClient(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true
    });

    await client.connect();
    return client;
};


const runGraphQLServer = function (context) {
    const typeDefs = `

    type Invoice {
        _id: ID!
        date: String!
        concept: String!
        quantity: Int!
        owner: Owner!
    }

    type Owner {
        _id: ID!
        username: String!
        password: String!
        invoices: [Invoice!]
        token: ID
    }

    type Query {
        login (username: String!, password: String!): Owner!
        logout (username: String!, token: ID!): Owner!
        getInvoices(username: String!, token: ID!): [Invoice!]
    }

    type Mutation {
        addUser (username: String!, password: String!): Owner!
        addInvoice (concept: String!, quantity: Int!, owner: String!, token: ID!, username: String!): Invoice!
        removeUser (username: String!, token: ID!): Owner
    }

`


    const resolvers = {

        Owner: {
            invoices: async (parent, args, ctx, info) => {
                const username = parent.username;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("invoices");

                const result = await collection.find({ owner: username}).toArray();
                return result;
            }
        },

        Invoice: {
            owner: async (parent, args, ctx, info) => {
                const username = parent.owner;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("owner");

                const result = await collection.findOne({ username: username});
                return result;
            }
        },

        Query: {

            login: async (parent, args, ctx, info) => {
                const { username, password } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("owner");

                const result = await collection.findOne({ username: username, password: password })

                if (result) {
                    await collection.updateOne({ "username": username }, { $set: { "token": uuid.v4() } });
                } else {
                    throw new Error(`Wrong username or password`);
                }

                const result2 = await collection.findOne({ username: username });

                return result2;
            },

            logout: async (parent, args, ctx, info) => {
                const { username, token } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("owner");

                const result = await collection.findOne({ username: username, token: token })

                if (result) {
                    await collection.updateOne({ "username": username }, { $set: { "token": null } })
                }
                if (!result) {
                    throw new Error(`Error`)
                }

                const result2 = await collection.findOne({ username: username })

                return result2;

            },

            getInvoices: async (parent, args, ctx, info) => {
                const { username, token } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("owner");
                const collection2 = db.collection("invoices");

                if(! await collection.findOne({username, token})){
                    throw new Error(`User not logged in`)
                }

                const result = await collection2.find({ owner: username}).toArray();

                return result;
            }
        },

        Mutation: {
            addUser: async (parent, args, ctx, info) => {
                const { username, password } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("owner");

                if (await collection.findOne({ username: username })) {
                    throw new Error(`Username ${username} is not available.`);
                }

                const result = await collection.insertOne({ username, password });

                return {
                    _id: result.ops[0]._id,
                    username,
                    password
                }

            },

            addInvoice: async (parent, args, ctx, info) => {
                const { concept, quantity, owner, token, username } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("invoices");

                var today = new Date();
                var dd = String(today.getDate()).padStart(2, '0');
                var mm = String(today.getMonth() + 1).padStart(2, '0');
                var yyyy = today.getFullYear();
                today = `${dd}/${mm}/${yyyy}`;
                const date = today;

                const collection2 = db.collection("owner")

                if (!await collection2.findOne({ username, token })) {
                    throw new Error(`User not logged in`)
                }

                await collection.insertOne({ date, concept, quantity, owner });
                const result = await collection.findOne({ concept });

                return result;

            },

            removeUser: async (parent, args, ctx, info) => {
                const { username, token } = args;
                const { client } = ctx;

                const db = client.db("invoices");
                const collection = db.collection("invoices");
                const collection2 = db.collection("owner");

                if(! await collection2.findOne({username, token})){
                    throw new Error(`User not logged in`)
                }

                const result = await collection2.findOneAndDelete({ username})
                await collection.deleteMany({owner: username});

                return result.value;
            }
        }
    }

    const server = new GraphQLServer({ typeDefs, resolvers, context });
    const options = {
        port: 8000
    };

    try {
        server.start(options, ({ port }) =>
            console.log(
                `Server started, listening on port ${port} for incoming requests.`
            )
        );
    } catch (e) {
        console.info(e);
        server.close();
    }

};


const runApp = async function () {
    const client = await connectToDb(usr, pwd, url);
    console.log("Connect to Mongo DB");
    try {
        runGraphQLServer({ client });
    } catch (e) {
        console.info(e);
        client.close();
    }
};

runApp();
