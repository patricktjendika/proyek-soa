const express = require("express"), cors = require("cors");
const bookshelf = require("./routes/bookshelf");
const review = require("./routes/review");
const bookmark = require("./routes/bookmark");
const user = require("./routes/user.js")
const app = express();

app.use(cors());
app.use(express.urlencoded({extended:true}));
app.use("/bookshelf", bookshelf);
app.use("/review", review);
app.use("/bookmark", bookmark);
app.use("/user",user);

app.listen(3000, () => {
    console.log("Listening on port 3000...");
});