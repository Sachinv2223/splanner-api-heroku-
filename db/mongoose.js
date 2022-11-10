const MONGOO_URL = "mongodb+srv://zeleoz:VdnM74N25wUKAvi9@zeleozcluster.1aqpg.mongodb.net/planner_db?retryWrites=true&w=majority";

//This file will handle connection logic to MongoDB db
const mongoose = require('mongoose');
require('dotenv').config({ path: 'envi.env' })

//normaly we dont we openly put username and password. For that we use "Dotenv" package

/* Connecting to the MongoDB database. */
mongoose.connect(MONGOO_URL)
    .then((res) => {
        console.log('Database connected successfully...')
    }).catch((err) => {
        console.log('An error has been occured while connecting Database : ' + err)
    });

/* Exporting the mongoose object so that it can be used in other files. */
module.exports = { mongoose };