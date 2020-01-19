const express = require('express');
const {ApolloServer, PubSub} = require('apollo-server-express');
const {MongoClient} = require('mongodb');
const {readFileSync} = require('fs');
const http = require('http');
const path = require('path');

const resolvers = require('./resolvers');
const typeDefs = readFileSync('./typeDefs.graphql', 'UTF-8');
require('dotenv').config();

const start = async () => {
  const app = express();
 
  const MONGO_DB = process.env.DB_HOST;
  const pubsub = new PubSub();
  let db;
  try {
    const client = await MongoClient.connect(MONGO_DB, {useNewUrlParser: true, useUnifiedTopology: true});
    db = client.db();
  } catch (error) {
    console.log(`
    
      Mongo DB Host not found!
      please add DB_HOST environment variable to .env file

      exiting...
       
    `);
    process.exit(1);
  };

  app.use(
    '/img/photos', 
    express.static(path.join(__dirname, 'assets', 'photos'))
  );

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({req, connection}) => {
      const githubToken = req ? req.headers.authorization : connection.context.Authorization;
      const currentUser = await db.collection('users').findOne({githubToken});
      return {db, currentUser, pubsub};
    }
  })

  server.applyMiddleware({app});

  const httpServer = http.createServer(app);
  server.installSubscriptionHandlers(httpServer);
  httpServer.timeout = 5000;

  httpServer.listen({port: 4000}, () =>
    console.log(`GraphQL Server running at http://localhost:4000${server.graphqlPath}`)
  );
};
start();