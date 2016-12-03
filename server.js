var express = require('express');
var app = express();
var session = require('cookie-session');
var assert = require('assert');
var mongourl = 'mongodb://testing123:testing123@ds159737.mlab.com:59737/project';
var MongoClient = require('mongodb').MongoClient;
var ObjectId = require('mongodb').ObjectID;
var bodyParser = require('body-parser');
var fileUpload = require('express-fileupload');

app.set('view engine', 'ejs');

app.use(session({
  name: 'session',
  keys: ['key1','key2'],
  //maxAge: 5 * 60 * 1000
}));

app.use(fileUpload());
app.use(bodyParser.json());
app.use(express.static(__dirname + '/public'));

app.get('/', function(req,res) {
	if (!req.session.authenticated) {
		res.sendFile(__dirname + '/public/login.html');
	}else{
		res.redirect('/read');
	}
});

//login
app.get('/login', function(req, res){
	if(!req.session.authenticated){
		res.sendFile(__dirname + '/public/login.html'); 
	}else{
		res.redirect('/read');
	}
});

app.post('/login',function(req,res) {
	if(req.body.id==null){
		res.sendFile(__dirname + '/public/login.html');
	}else{
		var criteria={};
		criteria['userid']=req.body.id;
		MongoClient.connect(mongourl,function(err,db){
			assert.equal(err,null);
			console.log('Connected to mlab.com\n');
			//find user with id
			db.collection('users').findOne(criteria,function(err,doc){
			//handle err
				if(err){
					console.log('Error finding user.');
					return res.status(500).send({message:'Error finding user.'});
				}
				//check for user
				if(!doc){
					console.log('No user.');
					//return res.status(500).send({message:'No user.'});
					res.sendFile(__dirname + '/public/login.html');
				}
				console.log('User found.');
				//check pw
				if(doc.password!=req.body.password){
					console.log('Wrong password.');
					//return res.status(401).send({message:'Wrong password.'});
					res.sendFile(__dirname + '/public/login.html');
				}
				//return user info
				db.close();
				console.log(doc);
				req.session.authenticated = true;
				req.session.userid=doc.userid;
				console.log('user: ' + req.session.userid);
				//res.redirect('/read');
				redirect(req,res);
			});
		});
	}
});

//logout
app.get('/logout', function(req,res) {
	req.session = null;
	res.redirect('/');
});

//register
app.get('/register', function(req,res){
	if(!req.session.authenticated){
		res.sendFile(__dirname + '/public/register.html');
	}else{
		res.redirect('/read');
	}
});

app.post('/register', function(req,res){
	if(req.body.id!=null){
		var criteria = {};
		criteria['userid'] = req.body.id;
		if(req.body.password!=''){
			criteria['password'] = req.body.password;
		}
		
		MongoClient.connect(mongourl, function(err,db){
			assert.equal(err,null);
			db.collection('users').insertOne(criteria, function(err,doc){
				db.close();
				if(err){
					res.redirect('/register');
				}else{
					res.redirect('/login');
				}
			});
		});
	}else{
		console.log('[Register Error] Missing userid!')
		res.end();
	}

});

//read
app.get('/read',function(req,res){
  if (!req.session.authenticated) {
		savingPage(req,res);
		res.sendFile(__dirname + '/public/login.html');
  }else{
  	MongoClient.connect(mongourl, function(err, db) {
		criteria=req.query;
		assert.equal(err,null);
		console.log('Connected to mlab.com\n');
		findNRest(criteria,db,function(rest) {
			db.close();
			console.log('Disconnected mlab.com\n');
			res.render('read',{c:rest,criteria:JSON.stringify(req.query),userid:req.session.userid});
			res.end();
		});
  	});
  }
});

function findNRest(criteria,db,callback) {
		var rest = [];
		db.collection('restaurants').find(criteria,function(err,result) {
			assert.equal(err,null);
			result.each(function(err,doc) {
				if (doc != null) {
					rest.push(doc);
				} else {
					callback(rest);
				}
			});
		})
}

app.get('/new',function(req,res){
	//res.sendFile(__dirname + '/public/new.html'); 

	if(!req.session.authenticated){
		savingPage(req,res);
		res.sendFile(__dirname + '/public/login.html');
	}else{
		res.render("new");
	}
});

app.post('/create', function(req, res) {
    var sampleFile;

    if (!req.files) {
        res.send('No files were uploaded.');
        return;
    }

    MongoClient.connect(mongourl,function(err,db) {
      console.log('Connected to mlab.com\n');
      assert.equal(null,err);
      create(req,db,req.body.name,req.body.borough,req.body.cuisine,req.body.street,req.body.building,req.body.zipcode,
req.body.lon,req.body.lat,req.files.sampleFile, function(rest) {
        db.close();
	console.log('Disconnected mlab.com\n');
        if (rest.insertedId != null) {
	  console.log('Insert success');
          res.redirect('/display?_id='+rest.insertedId);
        } else {
          res.status(500);
          res.end(JSON.stringify(rest));
        }
      });
    });
});

function create(req,db,name,borough,cuisine,street,building,zipcode,lon,lat,bfile,callback) {
  db.collection('restaurants').insertOne({
    "name":name,
    "borough":borough,
    "cuisine":cuisine,
    "street":street,
    "building":building,
    "zipcode":zipcode,
    "lon":lon,
    "lat":lat,
    "data" : new Buffer(bfile.data).toString('base64'),
    "mimetype" : bfile.mimetype,
    "creator": req.session.userid
  }, function(err,result) {
    //assert.equal(err,null);
    if (err) {
      result = err;
      console.log('insertOne Error: ' + JSON.stringify(err));
    } else {
      console.log("Inserted _id = " + result.insertedId);
    }
    callback(result);
  });
}

//display
app.get('/display',function(req,res){
	if(req.query._id==null){
		res.status(400).end('Missing _id');
	}else{
		var criteria = {}
		criteria['_id'] = ObjectId(req.query._id);
	  	MongoClient.connect(mongourl, function(err, db) {
			assert.equal(err,null);
			console.log('Connected to mlab.com\n');
			findOneRest(criteria,db,function(rest) {
				db.close();
				console.log('Disconnected mlab.com\n');
				if(rest!=null){
	  				res.render('create',{c:rest});
				}else{
					res.status(404).end('Restaurant with _id '+req.query._id+' not found.'); 
				}
			});
  		});
	}
});

function findOneRest(criteria,db,callback) {
		db.collection('restaurants').findOne(criteria,function(err,result) {
			assert.equal(err,null);
			callback(result);
		});
}

app.get('/gmap',function(req,res){
  MongoClient.connect(mongourl, function(err, db) {
    assert.equal(err,null);
    console.log('Connected to mlab.com\n');
    var criteria = {'lat':req.query.lat,'lon':req.query.lon,'name':req.query.title};
    findRest(db,criteria,function(rest) {
      db.close();
      console.log('Disconnected mlab.com\n');
      res.render('gmap',{restaurant:rest});
      //name:rest.name,lat:rest.lat,lon:rest.lon,zoom:18
      res.end();
    });
  });
});

function findRest(db,criteria,callback) {
	db.collection('restaurants').findOne(criteria,function(err,result) {
		assert.equal(err,null);
		callback(result);
	});
}

//remove
app.get('/remove',function(req,res){
	if(!req.session.authenticated){
		savingPage(req,res);
  		res.sendFile(__dirname+'/public/login.html');
  	}else{
		if(req.query._id!=null){
			var criteria={'_id':ObjectId(req.query._id)};
			MongoClient.connect(mongourl,function(err,db){
    				assert.equal(err,null);
    				console.log('Connected to mlab.com\n');
    				findRest(db,criteria,function(rest){
					if(rest!=null){
						if(req.session.userid==rest.creator){
							db.collection('restaurants').deleteOne(criteria);
							console.log('remove success');
							db.close();
							console.log('Disconnected mlab.com\n');
							res.render('remove');
						}else{
							res.render('noRemove');
						}
					}
				    				
				});
    			});
		}else{
			res.end('Missing query: _id');
		}
  	}
});

//update
app.get('/change',function(req,res){
	if(!req.session.authenticated){
		savingPage(req,res);
  		res.sendFile(__dirname+'/public/login.html');
  	}else{
		if(req.query._id!=null){
			var criteria={'_id':ObjectId(req.query._id)};
			MongoClient.connect(mongourl,function(err,db){
    				assert.equal(err,null);
    				console.log('Connected to mlab.com\n');
    				findRest(db,criteria,function(rest){
					db.close();
					console.log('Disconnected mlab.com\n');
					if(rest!=null){
						if(req.session.userid==rest.creator){
							res.render('change',{r:rest});
						}else{
							res.render('noChange');
						}
					}
				    				
				});
    			});
		}else{
			res.end('Missing query: _id');
		}
	}
});

app.post('/change',function(req,res){
	var criteria = req.body;
	console.log(criteria);
	var id = req.body._id;

	if(req.body.isPhotoNull!='on'){
		criteria['data'] = new Buffer(req.files.sampleFile.data).toString('base64');
		criteria['mimetype'] = req.files.sampleFile.mimetype;
	}else{
		//delete isPhotoNull:'on'
		//no change on photo if the user ticks isPhotoNull
		delete criteria['isPhotoNull'];
	}
	//delete _id from criteria because of no ObjectId for update
	delete criteria['_id'];
	
	MongoClient.connect(mongourl,function(err,db){
		assert.equal(err,null);
		db.collection('restaurants').update({"_id": ObjectId(id)},{$set: criteria},function(err,result){
				db.close();
				if(!err){
					res.redirect('/display?_id='+id);
				}else{
					res.end(JSON.stringify(err));
				}
		});
	});
	
	
});

//rate
app.get('/rate',function(req,res){
	if(!req.session.authenticated){
		savingPage(req,res);
  		res.sendFile(__dirname+'/public/login.html');
  	}else{
		if(req.query._id!=null && req.query.name!=null){
			var criteria = {};
			criteria['_id'] = ObjectId(req.query._id);
			criteria['name'] = req.query.name;
			MongoClient.connect(mongourl,function(err,db){
    				assert.equal(err,null);
    				console.log('Connected to mlab.com\n');
    				findRest(db,criteria,function(rest){
					db.close();
					console.log('Disconnected mlab.com\n');
					if(rest!=null){
						res.render('rate',{r:rest, user:req.session.userid});
					}else{
						res.status(404).end('Restaurant with _id '+req.query._id+' not found.')
					}			
				});
    			});
		}else{
			res.end('Missing query: _id');
		}
	}
});

app.post('/rate', function(req,res){
	// Used to create the criteria: {"rating": { "score":5, "user":admin}}
	var criteria1 = {};
	var criteria2 = {};
	// Used to check whether a user rated the document or not
	var condition = {};
	
	condition['_id'] = ObjectId(req.body._id);
	condition['rating.user'] = req.body.user;
	
	criteria2['score'] = req.body.score;
	criteria2['user'] = req.body.user;
	
	criteria1['rating'] = criteria2;

	MongoClient.connect(mongourl, function(err,db){
		assert.equal(err,null);
		db.collection('restaurants').findOne(condition, function(err,doc){
			if(doc==null){
				// This function is to push the criteria to rating.
				//push is used to append a Value to an Array
				db.collection('restaurants').updateOne({"_id":ObjectId(req.body._id)}, {$push: criteria1}, function(err,result){
					db.close();
					if(!err){
						res.redirect('/display?_id='+req.body._id);
					}else{
						res.end();
					}
				});
			}else{
				//res.end('You have already rated this restaurant!');
				res.render('alreadyRated');		
			}
		});

	});
});

//search
app.get('/search', function(req,res){
	if(!req.session.authenticated){
		savingPage(req,res);
		res.sendFile(__dirname + '/public/login.html');
	}else{
		res.render("search");
	}
});

app.post('/search', function(req,res){
	query = '?';
	if(req.body.isNameNull!='on'){
		query = query+'name='+req.body.name+'&';
	}
	if(req.body.isCuisineNull!='on'){
		query = query+'cuisine='+req.body.cuisine+'&';
	}
	if(req.body.isBoroughNull!='on'){
		query = query+'borough='+req.body.borough+'&';
	}
	res.redirect('/read'+query);
});

//api/read
app.get('/api/read/:field/:value', function(req,res){
	var criteria = {};
	criteria[req.params.field] = req.params.value;
	
	MongoClient.connect(mongourl, function(err,db){
		assert.equal(err,null);
		findNRest(criteria,db,function(restaurantList) {
			db.close();
			if(restaurantList.length<1){
				res.send({});
			}else{
				res.send(restaurantList);
			}
			
		});
	});
});

app.post('/api/create', function(req,res){	
	var criteria={};
	criteria=req.body;
	var id = req.body._id;
	MongoClient.connect(mongourl, function(err,db){
		assert.equal(err,null);
		db.collection('restaurants').insertOne(criteria, function(err,result){
			db.close();
			assert.equal(err,null);
			if(err){
				console.log('insertOne Error: ' + JSON.stringify(err));
				res.send({status:"failed"});
				//console.log('{"status": "failed"}');
				//res.redirect('/new');
			}else{
				console.log('insertOne Success, key: '+result.insertedId);
				//console.log('{"status": "ok", "_id": ObjectId(id) }');			
				res.send({status:'ok', _id:ObjectId(id)});
				//res.redirect('/display?_id='+result.insertedId);
			}
		});
	});
});

function savingPage(req,res){
	req.session.previousPage = req.url;
	console.log('Saving url: '+req.session.previousPage);
}

function redirect(req,res){
	if(req.session.previousPage==null || req.session.previousPage==''){
		res.redirect('/');
	}else{
		res.redirect(req.session.previousPage);
	}
}

app.listen(process.env.PORT || 8099);
