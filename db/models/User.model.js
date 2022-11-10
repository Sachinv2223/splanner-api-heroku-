const mongoose = require('mongoose');
var _ = require('lodash');
const jwt = require("jsonwebtoken");
const crypto = require('crypto');
const bcrypt = require('bcryptjs')
require('dotenv').config({ path: 'envi.env' })

//! JWT Secret
const jwtSecret = "5JQEyxwqS1LET07DyZ7Fgy45Y4ajPIHB7Y4lboi1EJk8";

const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 4,
    },
    sessions: [{
        token: {
            type: String,
            required: true
        },
        expiresAt: {
            type: Number,
            required: true
        }
    }]
});

//* ------Instance methods----------
UserSchema.methods.toJSON = function () {
    const user = this;
    const userObject = user.toObject();
    // return the document except password and sessions(these shouldn't be made public or available)
    return _.omit(userObject, ['password', 'sessions']);
}

UserSchema.method('generateAccessAuthToken', function () {
    const user = this;
    return new Promise((resolve, reject) => {
        //create JWT and return it
        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "15m" }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                reject(err);
            }
        })
    })
});

UserSchema.methods.generateRefreshAuthToken = function () {
    // to generate a 64byte hex string - it doesnt save it to DB. saveSessionToDatabase() does that
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buff) => {
            if (!err) {
                let token = buff.toString('hex');
                return resolve(token);
            }
        })
    })
}

UserSchema.methods.createSession = function () {
    let user = this;
    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDatabase(user, refreshToken)
    }).then((refreshToken) => {
        return refreshToken;
    }).catch((err) => {
        return Promise.reject(`Failed to save session to Database : ${err}`)
    })
}

//*--------- Model (static) methods ---------

UserSchema.statics.getJWTSecret = function(){
    return jwtSecret;
}

UserSchema.statics.findByIdAndToken = function (_id, token) {
    const user = this;
    return user.findOne({
        _id,
        'sessions.token': token
    });
};

UserSchema.statics.findByCrendentials = function (email, password) {
    let user = this;
    return user.findOne({
        email: email
    }).then((user) => {
        if (!user) return Promise.reject();

        return new Promise((resolve, reject) => [
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) resolve(user);
                else {
                    reject();
                }
            })
        ])
    })
}

UserSchema.statics.hasRefreshTokenExpired = function (expiresAt) {
    let secondsUntilEpoch = Date.now() / 1000;
    /* Checking if the refresh token has expired. */
    if (expiresAt > secondsUntilEpoch) { return false; }
    else { return true; }
}



//*----------- Middleware ---------------
UserSchema.pre('save', function (next) {
    let user = this;
    let costFactor = 10;

    if (user.isModified('password')) {
        // if the password field has been edited/changed then run this code

        // generate salt and hash password
        bcrypt.genSalt(costFactor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }
})

//*--------------- Helper methods ---------------- 

let generateRefreshTokenExpiryTime = function () {
    let daysUntilExpire = 10;
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60 * 60);

    return ((Date.now() / 1000) + secondsUntilExpire);
}

let saveSessionToDatabase = function (user, refreshToken) {
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();

        user.sessions.push({ 'token': refreshToken, expiresAt });
        user.save().then(() => {
            // saved session successfully
            return resolve(refreshToken);
        }).catch((err) => {
            reject(err);
        })
    })
}

const User = mongoose.model('User', UserSchema);

module.exports = { User };