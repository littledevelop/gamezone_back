const db = require("../config/db");

//get all games
const getGames = async(req,res) => {
    try{
        const [games] = await db.query(`SELECT 
            g.id, 
            g.game_name,
            g.platform_id,
            p.name AS platform_name,
            g.game_type_id,
            gt.type_name AS game_type_name,
            g.genre,
            g.description,
            g.status,
            g.created_at,
            g.updated_at 
            FROM games g 
            LEFT JOIN platforms p 
            ON g.platform_id = p.id 
            LEFT JOIN game_types gt 
            ON g.game_type_id = gt.id 
            ORDER BY g.id DESC`);

        return res.status(200).json({
            success:true,
            count:games.length,
            games
        });
    }catch(error){
        console.log("Get Games Error:", error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while fetching games"
        });
    }
};


//get single game
const getGameById = async(req,res) => {
    try{
        const {id} = req.params;
        const [games] = await db.query(`
            SELECT 
            g.id, 
            g.game_name, 
            g.platform_id,
            p.name AS platform_name,
            g.game_type_id,
            gt.type_name AS game_type_name,
            g.genre,
            g.description, 
            g.status, 
            g.created_at, 
            g.updated_at 
            FROM games g 
            LEFT JOIN platforms p 
            ON g.platform_id = p.id 
            LEFT JOIN game_types gt 
            ON g.game_type_id = gt.id 
            WHERE g.id=?`,[id]);
        
        if(games.length === 0)
        {
            return res.status(404).json({
                success:false,
                message:"Games not found"
            });
        }

        return res.status(200).json({
            success:true,
            game: games[0]
        });
                
    }catch(error)
    {
        console.log("Get Game BY ID Error:", error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while fetching game"
        });
    }
};

//Common Game Validation
const validateGameData = async({
game_name,platform_id,status
}) =>{
    //validate game name
    if(!game_name || !game_name.trim()){
        return "Game name is required";
    }

    //validate platform
    if(!platform_id){
        return "Platform is required";
    }

    //check whether platform exists
    const [platform] = await db.query(`SELECT id FROM platforms WHERE id=?`,[platform_id]);

    if(platform.length === 0){
        return "Invalid Platform";
    }

    //validate status according to current database ENUM
    if(status && !["active","inactive"].includes(status)){
        return "Status must be either active or inactive";
    }
    return null;
};

//create game
const createGame = async(req,res)=>{
    try{
        const {game_name, platform_id, game_type_id, genre, description, status} = req.body;

        //common validation
        const validationError = await validateGameData({
            game_name,
            platform_id,
            status
        });

        if(validationError){
            return res.status(400).json({
                success:false,
                message:validationError
            });
        }

        const gameStatus = status || "active";

        const [result] = await db.query(`
            INSERT INTO games(
            game_name,
            platform_id,
            game_type_id,
            genre,
            description,
            status
            ) VALUES(?,?,?,?,?,?)`, 
             [game_name, 
              platform_id || null,
              game_type_id || null,
              genre || null, 
              description || null,
              gameStatus
            ]);

        return res.status(201).json({
            success:true,
            message:"Game created successfully",
            game_id: result.insertId
        });

    }catch(error){
        console.log("Create Game Error:",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while creating game"
        });
    }
};

//update games
const updateGame = async(req,res) => {
    try{
        const {id} = req.params;

        const {game_name, platform_id, game_type_id, genre, description, status} = req.body;

        const [existingGame] = await db.query("SELECT id from games WHERE id = ?", [id]);

        if(existingGame.length === 0){
            return res.status(404).json({
                success:false,
                message:"Game not found"
            });
        }

        //common validation
        const validationError = await validateGameData({
            game_name,
            platform_id,
            status
        });

        if(validationError){
            return res.status(400).json({
                success:false,
                message:validationError
            });
        }

        const gameStatus = status || "active"

        await db.query(`
            UPDATE games 
            SET
             game_name=?, 
             platform_id=?, 
             game_type_id=?, 
             genre=?, 
             description=?, 
             status=? 
             WHERE id=? `,
             [game_name, 
              platform_id || null, 
              game_type_id || null, 
              genre || null, 
              description || null, 
              gameStatus, 
              id ]);

        return res.status(200).json({
            success:true,
            message:"Game updated successfully"
        });
    }catch(error){
        console.log("Update Game Error",error.message);
        return res.status(500).json({
            success:false,
            message:"Server error while updating game"
        });
    }
};

const deleteGame = async(req,res) => {
    try{
        const {id} = req.params;
        
        const [existingGame] = await db.query("SELECT id FROM games WHERE id = ?",[id]);
        if(existingGame.length === 0){
            return res.status(404).json({
                success:false,
                message:"Game Not Found"
            });
        }

        await db.query("DELETE FROM games where id= ?", [id]);

        return res.status(200).json({
            success:true,
            message:"Game Deleted Successfully"
        });
   
    }catch(error){
     
        console.log("Delete Game Error:",error.message);
     
        return res.status(500).json({
            success:false,
            message:"Server error while deleting game"
        });
    }
};

module.exports = {
    getGames,
    getGameById,
    createGame,
    updateGame,
    deleteGame
};
