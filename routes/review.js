const express = require("express"), mysql = require("mysql"), request = require("request");
const xml2js = require('xml2js'), jwt = require("jsonwebtoken");
const parser = new xml2js.Parser();
const config = require("../config");
const router = express.Router();
const pool = mysql.createPool(config.database);

function getConnection(){
    return new Promise(function(resolve, reject){
        pool.getConnection(function(err,conn){
            if(err){
                reject(err);
            }else{
                resolve(conn);
            }
        });
    });
}

function executeQuery(conn, query){
    return new Promise(function (resolve, reject){
        conn.query(query, function(err, result){
            if(err){
                reject(err);
            }else{
                resolve(result);
            }
        });
    });
}

function getBook(id_book){
    return new Promise(function (resolve,reject){
        var options = {
            'method':'GET',
            'url':`https://www.goodreads.com/book/show.xml?key=${process.env.API_KEY}&id=${id_book}`,
            'headers':{
                'Content-Type':'application/x-www-form-urlencoded'
            }
        };
        request(options,function(error,response){
            if(error) reject(new Error(error));
            else {
                var res;
                parser.parseString(response.body,(err, result)=>{
                    res=result;
                });
                //console.log(JSON.parse(res));
                resolve(res);
            }
        });
    });
}

//Create review
router.post("/:id_book", async (req, res)  => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        return res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        return res.status(401).send(obj);
    }
    if(user!=null){
        var id_book = req.params.id_book;
        var username = user.username;
        var rating = req.body.rating;
        var comment = req.body.comment;
        if(!(rating==null || rating=="") && !(id_book==null || id_book=="")){
            const book = await getBook(id_book);
            if(book.error!=null){
                var obj={
                    status:404,
                    message:"Book not found!"
                };
                res.status(404).send(obj);
            }else{
                const conn = await getConnection();
                const check = await executeQuery(conn, `select * from review where id_book='${id_book}' and username='${username}'`);
                if(check.length<=0){
                    const insert = await executeQuery(conn, `insert into review values('${id_book}','${username}',${rating},'${comment}')`);
                    var obj={
                        status:201,
                        message:`Review for book with id ${id_book} created!`
                    };
                    res.status(201).send(obj);
                }else{
                    var obj={
                        status:400,
                        message:"You have reviewed this book!"
                    };
                    res.status(400).send(obj);
                }
                conn.release();
            }
        }else{
            var obj={
                status:400,
                message:"Required field is not filled!"
            };
            res.status(400).send(obj);
        }
    }else{
        var obj={
            status:400,
            message:"You are not allowed to access this resource!"
        };
        res.status(400).send(obj);
    }
});

//Show reviews according to the query
router.get("/", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        return res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        return res.status(401).send(obj);
    }
    if(user!=null){
        var username = req.query.username;
        var rating = req.query.rating;
        var id_book = req.query.id_book;
        const conn = await getConnection();
        const users = await executeQuery(conn, `select * from user`);
        
        var reviews;

        var c_username=0;
        var c_rating=0;
        var c_id_book=0;
        if(!(username==null || username=="")){
            c_username=1;
        }
        if(!(rating==null || rating=="")){
            c_rating=1;
        }
        if(!(id_book==null || id_book=="")){
            c_id_book=1;
        }

        if(c_username==1 && c_rating==0 && c_id_book==0){
            reviews = await executeQuery(conn, `select * from review where username='${username}'`);
        }else if(c_username==0 && c_rating==1 && c_id_book==0){
            reviews = await executeQuery(conn, `select * from review where rating=${rating}`);
        }else if(c_username==0 && c_rating==0 && c_id_book==1){
            reviews = await executeQuery(conn, `select * from review where id_book=${id_book}`);
        }else if(c_username==1 && c_rating==1 && c_id_book==0){
            reviews = await executeQuery(conn, `select * from review where rating=${rating} and username='${username}'`);
        }else if(c_username==1 && c_rating==0 && c_id_book==1){
            reviews = await executeQuery(conn, `select * from review where username='${username}' and id_book='${id_book}'`);
        }else if(c_username==0 && c_rating==1 && c_id_book==1){
            reviews = await executeQuery(conn, `select * from review where rating=${rating} and id_book='${id_book}'`);
        }else if(c_username==1 && c_rating==1 && c_id_book==1){
            reviews = await executeQuery(conn, `select * from review where username='${username}' and rating=${rating} and id_book='${id_book}'`);
        }else{
            reviews = await executeQuery(conn, `select * from review`);
        }
        if(reviews.length>0){
            var arr=[];
            for (let i = 0; i < reviews.length; i++) {
                var name;
                users.forEach(j => {
                    if(reviews[i].username==j.username){
                        name=j.name;
                    }
                });
                var avg_rating = await executeQuery(conn, `select ROUND(AVG( rating ), 2) avg_rating from review where id_book='${reviews[i].id_book}'`);
                const book = await getBook(reviews[i].id_book);
                var obj={
                    id_book: reviews[i].id_book,
                    title: book.GoodreadsResponse.book[0].title[0],
                    author:book.GoodreadsResponse.book[0].authors[0].author[0].name[0],
                    year:book.GoodreadsResponse.book[0].publication_year[0],
                    average_rating: avg_rating[0].avg_rating,
                    name: name,
                    rating: reviews[i].rating,
                    comment: reviews[i].comment
                }
                arr.push(obj);
            }
            var obj={
                status:200,
                reviews: arr
            };
            res.status(200).send(obj);
        }else{
            var obj={
                status:404,
                message:"Review not found!"
            };
            res.status(404).send(obj);
        }
        conn.release();
    }else{
        var obj={
            status:400,
            message:"You are not allowed to access this resource!"
        };
        res.status(400).send(obj);
    }
});

//Update review
router.put("/:id_book", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        return res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        return res.status(401).send(obj);
    }
    if(user!=null){
        const conn = await getConnection();
        var id_book = req.params.id_book;
        var username = user.username;
        var rating = req.body.rating;
        var comment = req.body.comment;
        var c_comment=0;
        var c_rating=0;
        if(!(comment==null || comment=="")){
            c_comment=1;
        }
        if(!(rating==null || rating=="")){
            c_rating=1;
        }
        const book = await getBook(id_book);
        if(book.error!=null){
            var obj={
                status:404,
                message:"Book not found!"
            };
            res.status(404).send(obj);
        }else{
            var fail=0;
            const review = await executeQuery(conn, `select * from review where username='${username}' and id_book='${id_book}'`);
            if(review.length>0){
                if(c_comment==0 && c_rating==0){
                    fail=1;
                    var obj={
                        status:400,
                        message:"Required field is not filled!"
                    };
                    res.status(400).send(obj);
                }else if(c_comment==1 && c_rating==0){
                    var update = await executeQuery(conn, `UPDATE review SET comment='${comment}' where id_book='${id_book}' and username='${username}'`);
                }else if(c_comment==0 && c_rating==1){
                    var update = await executeQuery(conn, `UPDATE review SET rating='${rating}' where id_book='${id_book}' and username='${username}'`);
                }else if(c_comment==1 && c_rating==1){
                    var update = await executeQuery(conn, `UPDATE review SET rating='${rating}', comment='${comment}' where id_book='${id_book}' and username='${username}'`);
                }
                if(!fail){
                    var obj={
                        status:200,
                        message:"Review updated!"
                    };
                    res.status(200).send(obj);
                }
            }else{
                var obj={
                    status:404,
                    message:"You never review this book!"
                };
                res.status(404).send(obj);
            }
        }
        conn.release();
    }else{
        var obj={
            status:400,
            message:"You are not allowed to access this resource!"
        };
        res.status(400).send(obj);
    }
});

//Delete review
router.delete("/:id_book", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        return res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        return res.status(401).send(obj);
    }
    if(user!=null){
        const conn = await getConnection();
        var id_book = req.params.id_book;
        var username = user.username;
        const book = await getBook(id_book);
        if(book.error!=null){
            var obj={
                status:404,
                message:"Book not found!"
            };
            res.status(404).send(obj);
        }else{
            var del = await executeQuery(conn, `delete from review where id_book='${id_book}' and username='${username}'`);
            if(del.affectedRows==0){
                var obj={
                    status:404,
                    message:"Review not found!"
                };
                res.status(404).send(obj);
            }else{
                var obj={
                    status:200,
                    message:"Review deleted!"
                };
                res.status(200).send(obj);
            }
            
        }
        conn.release();
    }else{
        var obj={
            status:400,
            message:"You are not allowed to access this resource!"
        };
        res.status(400).send(obj);
    }
});

module.exports = router;