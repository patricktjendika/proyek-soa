const express = require("express"), mysql = require("mysql"), request = require("request"), jwt = require("jsonwebtoken");
var xml2js = require('xml2js');
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

//create
router.post("/:id_buku", async(req,res)=>{
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
        var id_buku = req.params.id_buku;
        var username = user.username;
        var page_number = req.body.page_number;
        var note = req.body.note;
        console.log(id_buku);
        console.log(page_number);
        console.log(note);
        if((id_buku!=null && id_buku!="") && (page_number!=null && page_number!="") && (note!=null && note!="")){
            const book = await getBook(id_buku);
            if(book.error!=null){
                var obj={
                    status:404,
                    message:"Book not found!"
                };
                res.status(404).send(obj);
            }else{
                const conn = await getConnection();
                const check = await executeQuery(conn, `select * from bookmark where username='${username}' and id_book='${id_buku}'`);
                if(check.length<=0){
                    const insert = await executeQuery(conn, `insert into bookmark values('${username}', '${id_buku}', '${page_number}', '${note}')`);
                    var obj={
                        status:200,
                        message:`Bookmark for book with id ${id_buku} created!`
                    };
                    res.status(200).send(obj);
                }else{
                    var obj={
                        status:400,
                        message:"You have bookmark this book!"
                    };
                    res.status(400).send(obj);
                }
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

router.get("/:id_buku", async(req,res)=>{
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
        var id_buku = req.params.id_buku;
        if(id_buku!=null || id_buku!=""){
            const book = await getBook(id_buku);
            if(book.error!=null){
                var obj={
                    status:404,
                    message:"Book not found!"
                };
                res.status(404).send(obj);
            }else{
                const conn = await getConnection();
                const getBookmark = await executeQuery(conn, `select * from bookmark where id_book='${id_buku}' and username='${user.username}'`);
                if(getBookmark.length==0){
                    var obj = {
                        status:400,
                        message: "You have never bookmarked this book"
                    };
                }else{
                    var obj = {
                        status:200,
                        bookmark: {
                            id_book: id_buku,
                            title: book.GoodreadsResponse.book[0].title[0],
                            author:book.GoodreadsResponse.book[0].authors[0].author[0].name[0],
                            year:book.GoodreadsResponse.book[0].publication_year[0],
                            page_number: getBookmark[0].page_number,
                            note: getBookmark[0].note
                        }
                    };
                }
                res.status(200).send(obj);
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

router.put("/:id_buku", async(req,res)=>{
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
        var id_buku = req.params.id_buku;
        var username = user.username;
        var page_number = req.body.page_number;
        var note = req.body.note;
        var fail = true;
        console.log(id_buku);
        const book = await getBook(id_buku);
        if(book.error!=null){
            var obj={
                status:404,
                message:"Book not found!"
            };
            res.status(404).send(obj);
        }else{
            const bookmark = await executeQuery(conn, `select * from bookmark where username='${username}' and id_book='${id_buku}'`);
            if(bookmark.length>0){
                if((page_number==null || page_number=="") && (note==null || note=="")){
                    var obj={
                        status:400,
                        message:"Required field is not filled!"
                    };
                    res.status(400).send(obj);
                }else if((page_number!=null || page_number!="") && (note==null || note=="")){
                    fail = false;
                    const update = await executeQuery(conn, `update bookmark set page_number='${page_number}' where username='${username}' and id_book='${id_buku}'`);
                }else if((page_number==null || page_number=="") && (note!=null || note!="")){
                    fail = false;
                    const update = await executeQuery(conn, `update bookmark set note='${note}' where username='${username}' and id_book='${id_buku}'`);
                }else{
                    fail = false;
                    const update = await executeQuery(conn, `update bookmark set page_number='${page_number}', note='${note}' where username='${username}' and id_book='${id_buku}'`);
                }
                if(!fail){
                    var obj={
                        status:200,
                        message:"Bookmark updated!"
                    };
                    res.status(200).send(obj);
                }
            }else{
                var obj={
                    status:404,
                    message:"Bookmark not found!"
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

router.delete("/:id_buku", async(req,res)=>{
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
        var id_buku = req.params.id_buku;
        var username = user.username;
        const book = await getBook(id_buku);
        if(book.error!=null){
            var obj={
                status:404,
                message:"Book not found!"
            };
            res.status(404).send(obj);
        }else{
            var del = await executeQuery(conn, `delete from bookmark where username='${username}' and id_book='${id_buku}'`);
            if(del.affectedRows==0){
                var obj={
                    status:404,
                    message:"Bookmark not found!"
                };
                res.status(404).send(obj);
            }else{
                var obj={
                    status:200,
                    message:"Bookmark deleted!"
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