const fetch = require('node-fetch');
const {authorizeWithGithub} = require('../lib');
const {uploadStream} = require('../lib');
const path = require('path');

module.exports = {
  async postPhoto(root, args, { db, currentUser, pubsub }) {

    if (!currentUser) {
      throw new Error('only an authorized user can post a photo')
    }

    const newPhoto = {
      ...args.input,
      userID: currentUser.githubLogin,
      created: new Date()
    };

    const {insertedIds} = await db.collection('photos').insert(newPhoto,);
    newPhoto.id = insertedIds[0];

    const toPath = path.join(__dirname, '..', 'assets', 'photos', `${newPhoto.id}.jpg`);

    const { createReadStream } = await args.input.file;
    await uploadStream(createReadStream(), toPath);
    pubsub.publish('photo-added', { newPhoto });

    return newPhoto;
  },

  async githubAuth(parent, { code }, { db }) {
    let {
      message,
      access_token,
      avatar_url,
      login,
      name
    } = await authorizeWithGithub({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      code
    })

    if (message) {
      throw new Error(message)
    }

    let latestUserInfo = {
      name,
      githubLogin: login,
      githubToken: access_token,
      avatar: avatar_url
    }

    const { ops:[user] } = await db
      .collection('users')
      .replaceOne({ githubLogin: login }, latestUserInfo, { upsert: true })

    return { user, token: access_token }
  },

  addFakeUsers: async (parent, { count }, { db }) => {
    const randomUserApi = `https://randomuser.me/api/?results=${count}`;

    const { results } = await fetch(randomUserApi).then(res => res.json());

    const users = results.map(user => ({
      githubLogin: user.login.username,
      name: `${user.name.first} ${user.name.last}`,
      avatar: user.picture.thumbnail,
      githubToken: user.login.sha1
    }))

    await db.collection('users').insertMany(users)

    return users
  },

  async fakeUserAuth(parent, { githubLogin }, { db }) {
    var user = await db.collection('users').findOne({ githubLogin })

    if (!user) {
      throw new Error(`Cannot find user with githubLogin "${githubLogin}"`)
    }

    return {
      token: user.githubToken,
      user
    }
  }
};