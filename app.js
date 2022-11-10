/* Importing the express module. */
/* Creating an instance of the express module. */
const express = require('express');
const app = express();
const hostname = '0.0.0.0';
const PORT = 4000 || process.env.PORT;

const cors = require('cors')

// require('dotenv').config({ path: 'envi.env' })
// console.log(process.env.CUSTOM_PORT) // remove this after you've confirmed it is working

const { mongoose } = require('./db/mongoose');

/* Importing the body-parser module. */
const bodyParser = require('body-parser');


/* Importing the List and Task models */
const { List } = require('./db/models/List.model');
const { Task } = require('./db/models/Task.model');
const { User } = require("./db/models/user.model");
var jwt = require('jsonwebtoken');

/* The above code is telling the server to use the bodyParser middleware to parse the body of the
request. */
app.use(bodyParser.json());

/* This is a function that is listening for a request on port 4000. */
app.listen(PORT, hostname, () => {
    console.log(`Server app running at http://${hostname}:${PORT}/`);
})

//*------------- MIDDLEWARE START --------------------

//TODO This is a middleware function that is allowing the server to accept requests from other domains.
// app.use(cors());
app.all('*', function (req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
    res.header('Access-Control-Allow-Headers', 'Content-Type,x-access-token,x-refresh-token,_id');
    res.header('Access-Control-Expose-Headers', 'x-access-token,x-refresh-token,_id');
    if ('OPTIONS' == req.method) {
        res.sendStatus(200);
    } else {
        next();
    }
});


//TODO check wether the request has a valid JWT access token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    //verify the JWT
    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            //jwt token is invalid - //! DON'T AUTHENTICATE
            // console.log(err);
            res.status(401).send(`Error : ${err.name} - ${err.message}`);
        } else {
            //jwt is valid
            req.user_id = decoded._id;
            next();
        }
    })
}

//TODO Verify refresh-token middleware (which will be verifying session)
let verifySession = (req, res, next) => {
    let refreshToken = req.header('x-refresh-token');
    let _id = req.header('_id')

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            return Promise.reject({
                'error': 'User not found. Make sure that refresh token and user id are valid'
            })
        } else {
            //user is found; therfore user is valid
            //therefore session is exist in database - but still have to check if its expired or not

            req.user_id = user._id;
            req.userObject = user;
            req.refreshToken = refreshToken;
            let isSessionValid = false;

            user.sessions.forEach((session) => {
                if (session.token === refreshToken) {
                    //check if the session is expired
                    if (User.hasRefreshTokenExpired(session.expiresAt) === false) {
                        // refreshToken hasnot expired
                        isSessionValid = true;
                    }
                }
            });

            if (isSessionValid)
                //session is valid - call next() to continue with processing this web request
                next();
            else {
                //session not valid
                return Promise.reject({
                    'error': 'Refresh token has expired or session is invalid'
                })
            }
        }
    }).catch((err) => {
        res.status(401).send(`Reason for middleware error is ${err}`);
    })

};

//*------------- MIDDLEWARE END --------------------



//*------------- LIST OF ROUTES--------------------
app.get('/lists', authenticate, (req, res) => {
    //we want to return an array of all lists in db that belongs to the authenticated user
    List.find({
        _userId: req.user_id
    })
        .then((lists) => {
            res.send(lists);
        }).catch((err) => {
            res.status(401).send(err);
        })
})

// To get details of a specific list
app.get('/lists/:id', authenticate, (req, res) => {
    List.findOne({ _id: req.params.id, _userId: req.user_id })
        .then((list) => {
            res.send(list);
        }).catch((err) => {
            res.status(401).send(err);
        })
});

app.post('/lists', authenticate, (req, res) => {
    //we want to create a new list in db and return the new list to user (including id)
    //The list info will be passed in via JSON request body

    let newList = new List({
        Ltitle: req.body.Ltitle,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
        //ful list documents is returned (including id)
        res.send(listDoc);
    })
});

// Update list
app.patch('/lists/:id', authenticate, (req, res) => {
    //update the specified list with new values specified in JSON body
    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id },
        { $set: req.body }).then(() => {
            // res.sendStatus(200);
            res.status(200).send({ "updated": "true" });
        })
})

/* This is a route that is deleting a specific list based on the listId. */
app.delete('/lists/:id', authenticate, (req, res) => {
    //delete the specified list from db and return response
    List.findOneAndDelete({ _id: req.params.id, _userId: req.user_id }).then((removedListDoc) => {
        res.send(removedListDoc);

        //delete all the task that are in deleted list
        deleteTasksUsingListId(req.params.id);
    })
})

/* This is a route that is deleting all the lists and tasks from the database. */
app.delete('/lists', authenticate, (req, res) => {
    //delete all the list and all the task from db
    List.deleteMany({
        _userId: req.user_id
    }).then((deletedCountRes) => {

        //* also delete everything from task
        // Task.deleteMany({})
        //     .then(() => {
        //         console.log(`All task are deleted`);
        //     });
        deleteAllTasks;

        res.send(deletedCountRes);
    })
})


/* Returning all tasks that belong to a specific listId. */
app.get('/lists/:listId/task', authenticate, (req, res) => {
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks);
    })
})

/* This is a route that is returning a specific task based on the listId and taskId. */
app.get('/lists/:listId/task/:taskId', (req, res) => {
    Task.findOne({
        _listId: req.params.listId,
        _id: req.params.taskId
    }).then((task) => {
        res.send(task);
    })
})



app.post('/lists/:listId/task', authenticate, (req, res) => {
    // here we want to create a new task in the specific list (using listId)
    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((listDoc) => {
        if (listDoc) {
            // listDoc object is valid
            // so, currently authenticated user can create new task
            return true;
        }
        else {
            return false;
        }
    }).then((isTaskCreatingValid) => {
        if (isTaskCreatingValid) {

            let newTask = new Task({
                Ttitle: req.body.Ttitle,
                _listId: req.params.listId
            });
            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            });
        } else {
            res.status(404).send(`The request data cant be found`)
        }
    })


})

app.patch('/lists/:listId/task/:taskId', authenticate, (req, res) => {
    // here we want to update a task in the specific list (using listId and taskId) 

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((listDoc) => {
        if (listDoc) {
            Task.findOneAndUpdate({
                _listId: req.params.listId,
                _id: req.params.taskId

            }, {
                $set: req.body
                // Ttitle: req.body.Ttitle
            }).then(() => {
                res.send({
                    message: 'Updated successfully'
                })
            })
        } else {
            res.status(404).send(`The requested data cant be found`);
        }
    })


})

app.delete('/lists/:listId/task/:taskId', authenticate, (req, res) => {
    //delete the specified task using listId and taskId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((listDoc) => {
        if (listDoc) {
            Task.findOneAndDelete({
                _listId: req.params.listId,
                _id: req.params.taskId
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            }).catch((err) => {
                if (err.name == 'CastError') {
                    res.sendStatus(404);
                } else {
                    res.sendStatus(500);
                }
            })
        } else {
            res.status(404).send(`The requested data cant be found`);
        }
    })
})

//*------------- USER ROUTES--------------------
app.post('/user', (req, res) => {
    // user sign-up
    let body = req.body;
    let newUser = new User(body);

    newUser.save().then(() => {
        return newUser.createSession();
    }).then((refreshToken) => {
        //Session created and refresh token returned
        //now generate access token

        return newUser.generateAccessAuthToken().then((accessToken) => {
            return { accessToken, refreshToken }
        });
    }).then((authTokens) => {
        res
            .header('x-refresh-token', authTokens.refreshToken)
            .header('x-access-token', authTokens.accessToken)
            .send(newUser);
    }).catch((err) => {
        res.status(400).send(`Reason for error is ${err}`);
    })
})

app.post('/user/login', (req, res) => {
    //user login
    let email = req.body.email;
    let password = req.body.password;

    User.findByCrendentials(email, password).then((user) => {
        return user.createSession().then((refreshToken) => {
            // Sesssion created successfully - refreshToken returned
            //now we generate an access tokem for user
            return user.generateAccessAuthToken().then((accessToken) => {
                return { accessToken, refreshToken };
            });
        }).then((authTokens) => {
            res
                .header('x-refresh-token', authTokens.refreshToken)
                .header('x-access-token', authTokens.accessToken)
                .send(user);
        }).catch((err) => {
            res.status(400).send(`Reason for error is ${err}`);
        });
    })

})

app.get('/user/me/access-token', verifySession, (req, res) => {
    //we know that user is authenticated and we have user_id and userObject available to us
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((err) => {
        res.status(400).send(`Reason for error : ${err}`);
    });
})


//? ------------------- Helper methods ---------------------------
let deleteTasksUsingListId = function (_listId) {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log(`Tasks from  list id: ${_listId} is deleted`)
    });
}

let deleteAllTasks = function () {
    Task.deleteMany({})
        .then(() => {
            console.log(`All task are deleted`);
        });
}




