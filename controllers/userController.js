const db = require("../config/db");
const bcrypt = require("bcryptjs");
// Get all registered players
const getPlayers = async (req, res) => {
  try {
    const [players] = await db.query(`
            SELECT
                u.id,
                u.full_name,
                u.mobile,
                u.email
            FROM users u
            INNER JOIN roles r ON u.role_id = r.id
            WHERE r.role_name = 'Player'
            ORDER BY u.full_name ASC
        `);

    return res.status(200).json({
      success: true,
      data: players,
    });
  } catch (error) {
    console.error("Get players error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load players",
    });
  }
};

// Get all Staff and Players
const getUsers = async (req, res) => {
  try {
    const [users] = await db.query(`
      SELECT
        u.id,
        u.full_name,
        u.mobile,
        u.email,
        u.role_id,
        r.role_name
      FROM users u
      INNER JOIN roles r ON u.role_id = r.id
      WHERE r.role_name IN ('Staff', 'Player')
      ORDER BY u.full_name ASC
    `);

    return res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    console.error("Get users error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load users",
    });
  }
};

// Common function to create a user
const createUserRecord = async ({
  full_name,
  mobile,
  email,
  password,
  date_of_birth,
  address,
  role_id,
}) => {
  // Check email
  const [existingEmail] = await db.query(
    "SELECT id FROM users WHERE email = ?",
    [email],
  );

  if (existingEmail.length > 0) {
    const error = new Error("Email already registered");
    error.statusCode = 409;
    throw error;
  }

  // Check mobile
  const [existingMobile] = await db.query(
    "SELECT id FROM users WHERE mobile = ?",
    [mobile]
  );

  if (existingMobile.length > 0) {
    const error = new Error("Mobile number already registered");
    error.statusCode = 409;
    throw error;
  }
  // Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // Create user
  const [result] = await db.query(
    `INSERT INTO users
        (full_name, mobile, email, password, date_of_birth, address, role_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      full_name,
      mobile || null,
      email,
      hashedPassword,
      date_of_birth || null,
      address || null,
      role_id,
    ],
  );

  return {
    id: result.insertId,
    full_name,
    mobile: mobile || null,
    email,
    role_id,
  };
};

// Admin creates Staff or Player
const createUser = async (req, res) => {
  try {
    console.log("CREATe USER Record: ", req.body);
    const {
      full_name,
      mobile,
      email,
      password,
      date_of_birth,
      address,
      role_id,
    } = req.body || {};

    // Validate required fields
    if (!full_name || !email || !password || !role_id) {
      return res.status(400).json({
        success: false,
        message: "Full name, email, password and role are required",
      });
    }

    // Only Staff (2) or Player (3)
    if (![2, 3].includes(Number(role_id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    const user = await createUserRecord({
      full_name,
      mobile,
      email,
      password,
      date_of_birth,
      address,
      role_id: Number(role_id),
    });

    return res.status(201).json({
      success: true,
      message: "User created successfully",
      user,
    });
  } catch (error) {
    console.error("Create user error:", error);

    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to create user",
    });
  }
};

// Update Staff or Player
const updateUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);

    const {
      full_name,
      mobile,
      email,
      role_id,
      password,
    } = req.body || {};

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID",
      });
    }

    if (!full_name || !email || !role_id) {
      return res.status(400).json({
        success: false,
        message: "Full name, email and role are required",
      });
    }

    // Only Staff (2) or Player (3)
    if (![2, 3].includes(Number(role_id))) {
      return res.status(400).json({
        success: false,
        message: "Invalid role",
      });
    }

    // Check user exists
    const [existingUser] = await db.query(
      "SELECT id FROM users WHERE id = ?",
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check duplicate email
    const [existingEmail] = await db.query(
      "SELECT id FROM users WHERE email = ? AND id != ?",
      [email, userId]
    );

    if (existingEmail.length > 0) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Check duplicate mobile
    if (mobile) {
      const [existingMobile] = await db.query(
        "SELECT id FROM users WHERE mobile = ? AND id != ?",
        [mobile, userId]
      );

      if (existingMobile.length > 0) {
        return res.status(409).json({
          success: false,
          message: "Mobile number already registered",
        });
      }
    }

    // Update with password
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);

      await db.query(
        `UPDATE users
         SET full_name = ?,
             mobile = ?,
             email = ?,
             password = ?,
             role_id = ?
         WHERE id = ?`,
        [
          full_name,
          mobile || null,
          email,
          hashedPassword,
          Number(role_id),
          userId,
        ]
      );
    } else {
      // Update without changing password
      await db.query(
        `UPDATE users
         SET full_name = ?,
             mobile = ?,
             email = ?,
             role_id = ?
         WHERE id = ?`,
        [
          full_name,
          mobile || null,
          email,
          Number(role_id),
          userId,
        ]
      );
    }

    return res.status(200).json({
      success: true,
      message: "User updated successfully",
    });

  } catch (error) {
    console.error("Update user error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update user",
    });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const [existingUser] = await db.query(
      "SELECT id FROM users WHERE id = ?",
      [userId]
    );

    if (existingUser.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    await db.query("DELETE FROM users WHERE id = ?", [userId]);

    return res.status(200).json({
      success: true,
      message: "User deleted successfully",
    });

    
  }
  catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete user",
    });
  } 
};

module.exports = {
  getPlayers,
  getUsers,
  createUser,
  updateUser,
  deleteUser,
  createUserRecord,
};
