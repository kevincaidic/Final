require("dotenv").config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// ✅ Initialize Firebase using ENV (Render Safe)
admin.initializeApp({
  credential: admin.credential.cert({
    project_id: process.env.FIREBASE_PROJECT_ID,
    client_email: process.env.FIREBASE_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
  }),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});

const db = admin.firestore();
const auth = admin.auth();

// ROOT ROUTE
app.get('/', (req, res) => {
  res.json({ 
    message: 'Papayafresh API is working!',
    status: 'OK',
    timestamp: new Date().toISOString()
  });
});

// HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    server: 'PapayaFresh API',
    version: '2.0.0'
  });
});

// GET ALL USERS WITH SCAN DATA
app.get('/api/users/all', async (req, res) => {
  try {
    console.log('🔄 Fetching all users with scan data...');
    
    const usersSnapshot = await db.collection('users').get();
    const usersData = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
      const historySnapshot = await db.collection('users').doc(userId).collection('history').get();

      usersData.push({
        userId,
        email: userData.email || 'No email',
        user_id: userData.user_id || 'No user_id',
        created_at: userData.created_at || 'Unknown',
        shelfCount: shelfSnapshot.size,
        historyCount: historySnapshot.size,
        totalScans: shelfSnapshot.size + historySnapshot.size
      });
    }
    
    res.json({
      success: true,
      totalUsers: usersData.length,
      users: usersData
    });

  } catch (error) {
    console.error('❌ Error fetching users data:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// DASHBOARD STATS
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    const usersSnapshot = await db.collection('users').get();
    let totalScans = 0;
    let totalShelfItems = 0;
    let totalHistoryItems = 0;
    const userActivities = [];
    const allScans = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();

      const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
      const historySnapshot = await db.collection('users').doc(userId).collection('history').get();

      shelfSnapshot.forEach(doc => {
        const shelfItem = doc.data();
        allScans.push({
          userId,
          userEmail: userData.email,
          ...shelfItem,
          scanned_at: shelfItem.scannedDate || shelfItem.addedAt || new Date()
        });
      });

      totalShelfItems += shelfSnapshot.size;
      totalHistoryItems += historySnapshot.size;
      totalScans += shelfSnapshot.size + historySnapshot.size;
    }
    
    const responseData = {
      totalUsers: usersSnapshot.size,
      totalScans,
      papayasOnShelf: totalShelfItems,
      ripenessDistribution: calculateRipenessDistribution(allScans),
      weeklyScans: calculateWeeklyScans(allScans),
      userStats: {
        averageScansPerUser: usersSnapshot.size > 0 ? (totalScans / usersSnapshot.size).toFixed(1) : 0,
        activeUsers: allScans.length,
        totalShelfItems,
        totalHistoryItems
      }
    };

    res.json(responseData);

  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE USER
app.delete('/api/users/delete/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.status(404).json({ success: false, error: "User not found" });
    }

    // Delete subcollections
    await deleteSubcollection('shelf', userId);
    await deleteSubcollection('history', userId);

    // Delete main user document
    await db.collection('users').doc(userId).delete();

    // Delete from Firebase Auth
    try {
      await auth.deleteUser(userId);
    } catch (e) {
      console.log("Auth delete skipped:", e.message);
    }

    res.json({ success: true, message: "User deleted successfully" });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Helper functions
async function deleteSubcollection(name, userId) {
  const snapshot = await db.collection('users').doc(userId).collection(name).get();
  const promises = snapshot.docs.map(doc => doc.ref.delete());
  return Promise.all(promises);
}

function calculateRipenessDistribution(scans) {
  const d = { unripe: 0, ripe: 0, overripe: 0 };
  scans.forEach(s => {
    const r = (s.ripeness || "").toLowerCase();
    if (r.includes("unripe") || r === "green") d.unripe++;
    else if (r.includes("overripe") || r === "rotten") d.overripe++;
    else d.ripe++;
  });
  return d;
}

function calculateWeeklyScans(scans) {
  const weeks = [0, 0, 0, 0];
  const now = new Date();
  scans.forEach(s => {
    const t = new Date(s.scanned_at);
    const diff = Math.floor((now - t) / (1000 * 60 * 60 * 24 * 7));
    if (diff < 4) weeks[3 - diff]++;
  });
  return weeks;
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 PAPAYAFRESH API Server Running!');
  console.log('📍 Port:', PORT);
});
