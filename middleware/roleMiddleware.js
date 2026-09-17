const roleMiddleware = (...allowedRoles) =>{
    return (req,res,next) =>{
        if(!req.user){
            return res.status(401).json({
                success:false,
                message:"Authentication required"
            });
        }

        if(!allowedRoles.includes(req.user.role_name)){
            return res.status(403).json({
                success:false,
                message:"Access Denied. You do not have permission."
            });
        }
        next();
    };
};

module.exports = roleMiddleware;