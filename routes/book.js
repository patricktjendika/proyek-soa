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

function searchBook(query,page){
    return new Promise(function (resolve,reject){
        var options = {
            'method':'GET',
            'url':`https://www.goodreads.com/search/index.xml?key=${process.env.API_KEY}&q=${query}&page=${page}`,
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

//Show book according to the id
router.get("/id/:id_book", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        res.status(401).send(obj);
    }
    if(user!=null){
        var id_book = req.params.id_book;
        const conn = await getConnection();
        
        const book = await getBook(id_book);
        if(book.error!=null){
            var obj={
                status:404,
                message:"Book not found!"
            };
            res.status(404).send(obj);
        }else{
            var avg_rating = await executeQuery(conn, `select ROUND(AVG( rating ), 2) avg_rating from review where id_book='${id_book}'`);
            var b={
                id_book: id_book,
                title: book.GoodreadsResponse.book[0].title[0],
                author:book.GoodreadsResponse.book[0].authors[0].author[0].name[0],
                year:book.GoodreadsResponse.book[0].publication_year[0],
                average_rating: avg_rating[0].avg_rating,
                description: book.GoodreadsResponse.book[0].description[0]
            }
            var obj={
                status:200,
                book: b
            };
            res.status(200).send(obj);
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

//Show book according to the query
router.get("/", async (req, res) => {
    const token = req.header("x-auth-token");
    let user = {};
    if(!token){
        var obj={
            status:401,
            message:"Token not found!"
        };
        res.status(401).send(obj);
    }
    try{
        user = jwt.verify(token,"proyek-soa");
    }catch(err){
        var obj={
            status:401,
            message:"Token invalid!"
        };
        res.status(401).send(obj);
    }
    if(user!=null){
        var query = req.query.query;
        var page = req.query.page;
        if(page==null || page==""){
            page=1;
        }
        if(query==null || query==""){
            var obj={
                status:400,
                message:"Query is not filled!"
            };
            res.status(400).send(obj);
        }else{
            const conn = await getConnection();
        
            const book = await searchBook(query,page);
            const total = book.GoodreadsResponse.search[0]["total-results"][0];
            if(total==0){
                var obj={
                    status:404,
                    message:"Books not found!"
                };
                res.status(404).send(obj);
            }else{
                const length = book.GoodreadsResponse.search[0].results[0].work.length;
                var arr=[];
                for (let i = 0; i < length; i++) {
                    const id = book.GoodreadsResponse.search[0].results[0].work[i].best_book[0].id[0]._;
                    const avg_rating = await executeQuery(conn, `select ROUND(AVG( rating ), 2) avg_rating from review where id_book='${id}'`);
                    const b={
                        id_book: id,
                        title: book.GoodreadsResponse.search[0].results[0].work[i].best_book[0].title[0],
                        author: book.GoodreadsResponse.search[0].results[0].work[i].best_book[0].author[0].name[0],
                        year: book.GoodreadsResponse.search[0].results[0].work[i].original_publication_year[0]._,
                        average_rating: avg_rating[0].avg_rating
                    }
                    arr.push(b);
                }
                var obj={
                    status:200,
                    books: arr
                };
                res.status(200).send(obj);
            }
            conn.release();
        }
    }else{
        var obj={
            status:400,
            message:"You are not allowed to access this resource!"
        };
        res.status(400).send(obj);
    }
});

module.exports = router;