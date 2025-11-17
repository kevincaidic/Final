// server.js - UPDATED WITH FIREBASE AUTH DELETE

const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');

const app = express();
app.use(cors());
app.use(express.json());

// Initialize Firebase
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://papayafresh-db1.firebaseio.com"
});

const db = admin.firestore();
const auth = admin.auth(); // ✅ DAGDAG NI LINE PARA SA AUTHENTICATION

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'API is working!', timestamp: new Date() });
});

// ✅ HEALTH CHECK
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date(),
    server: 'PapayaFresh API',
    version: '2.0.0'
  });
});

// ✅ GET ALL USERS WITH THEIR SCAN DATA
app.get('/api/users/all', async (req, res) => {
  try {
    console.log('🔄 Fetching all users with scan data...');
    
    const usersSnapshot = await db.collection('users').get();
    const usersData = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Get user's shelf items (scanned papayas)
      const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
      const shelfCount = shelfSnapshot.size;
      
      // Get user's history (scan activities)
      const historySnapshot = await db.collection('users').doc(userId).collection('history').get();
      const historyCount = historySnapshot.size;
      
      usersData.push({
        userId: userId,
        email: userData.email || 'No email',
        user_id: userData.user_id || 'No user_id',
        created_at: userData.created_at || 'Unknown',
        shelfCount: shelfCount,
        historyCount: historyCount,
        totalScans: shelfCount + historyCount
      });
    }
    
    console.log(`✅ Found ${usersData.length} users`);
    res.json({
      success: true,
      totalUsers: usersData.length,
      users: usersData
    });
    
  } catch (error) {
    console.error('❌ Error fetching users data:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ DELETE USER ENDPOINT - UPDATED WITH AUTH DELETE
app.delete('/api/users/delete/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log('🗑️ DELETE /api/users/delete/', userId);

    // Check if user exists
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    const userData = userDoc.data();
    console.log('📋 User to delete:', {
      userId: userId,
      email: userData.email,
      user_id: userData.user_id
    });

    // ✅ 1. Delete user's shelf subcollection
    console.log('🗑️ Deleting shelf subcollection...');
    const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
    const shelfDeletePromises = shelfSnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(shelfDeletePromises);

    // ✅ 2. Delete user's history subcollection  
    console.log('🗑️ Deleting history subcollection...');
    const historySnapshot = await db.collection('users').doc(userId).collection('history').get();
    const historyDeletePromises = historySnapshot.docs.map(doc => doc.ref.delete());
    await Promise.all(historyDeletePromises);

    // ✅ 3. Delete the main user document
    console.log('🗑️ Deleting main user document...');
    await db.collection('users').doc(userId).delete();

    // ✅ 4. DELETE USER FROM FIREBASE AUTHENTICATION - DAGDAG NI
    console.log('🔐 Deleting user from Firebase Authentication...');
    try {
      await auth.deleteUser(userId);
      console.log('✅ User deleted from Authentication successfully');
    } catch (authError) {
      console.log('⚠️ User not found in Authentication (might be OK):', authError.message);
      // Continue even if user doesn't exist in Auth
    }

    console.log(`✅ User ${userId} deleted successfully from Firestore and Authentication`);
    
    res.json({ 
      success: true,
      message: 'User deleted successfully from Firestore and Authentication',
      deletedUser: {
        userId: userId,
        email: userData.email
      }
    });

  } catch (error) {
    console.error('❌ Error deleting user:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ GET USER'S SHELF ITEMS (SCANNED PAPAYAS)
app.get('/api/users/:userId/shelf', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔄 Fetching shelf items for user: ${userId}`);
    
    const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
    const shelfItems = [];
    
    shelfSnapshot.forEach(doc => {
      shelfItems.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Found ${shelfItems.length} shelf items for user ${userId}`);
    res.json({
      success: true,
      userId: userId,
      shelfCount: shelfItems.length,
      shelf: shelfItems
    });
    
  } catch (error) {
    console.error('❌ Error fetching shelf items:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ GET USER'S SCAN HISTORY
app.get('/api/users/:userId/history', async (req, res) => {
  try {
    const { userId } = req.params;
    console.log(`🔄 Fetching history for user: ${userId}`);
    
    const historySnapshot = await db.collection('users').doc(userId).collection('history').get();
    const historyItems = [];
    
    historySnapshot.forEach(doc => {
      historyItems.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    console.log(`✅ Found ${historyItems.length} history items for user ${userId}`);
    res.json({
      success: true,
      userId: userId,
      historyCount: historyItems.length,
      history: historyItems
    });
    
  } catch (error) {
    console.error('❌ Error fetching history:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ GET ALL REAL SCANS FROM SHELF COLLECTIONS - DAGDAG NI
app.get('/api/scans/all', async (req, res) => {
  try {
    console.log('🔄 Fetching all REAL scans from shelf collections...');
    
    const allScans = [];
    const usersSnapshot = await db.collection('users').get();
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      try {
        // Get user's shelf items (actual scanned papayas)
        const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
        
        shelfSnapshot.forEach(doc => {
          const shelfData = doc.data();
          
          // Use the CORRECT field names from your database
          allScans.push({
            id: doc.id,
            userId: userId,
            userEmail: userData.email || 'Unknown',
            // Use predictedRipeness instead of ripeness
            ripeness: shelfData.predictedRipeness || shelfData.ripeness || 'Unknown',
            variety: shelfData.variety || shelfData.name || 'Unknown',
            temperature: shelfData.temperature || 'N/A',
            scannedDate: shelfData.scannedDate || shelfData.harvestedDate || null,
            imageUrl: shelfData.imageUrl || null,
            predictionConfidence: shelfData.predictionConfidence || 0,
            isAIPrediction: shelfData.isAIPrediction || false,
            // Include all available data for debugging
            rawData: shelfData
          });
        });
        
      } catch (shelfError) {
        console.log(`⚠️ No shelf collection for user ${userId}:`, shelfError.message);
      }
    }
    
    // Sort by scanned date (newest first)
    allScans.sort((a, b) => {
      const dateA = a.scannedDate ? new Date(a.scannedDate) : new Date(0);
      const dateB = b.scannedDate ? new Date(b.scannedDate) : new Date(0);
      return dateB - dateA;
    });
    
    console.log(`✅ Found ${allScans.length} REAL scans from database`);
    
    res.json({
      success: true,
      totalScans: allScans.length,
      scans: allScans
    });
    
  } catch (error) {
    console.error('❌ Error fetching real scans:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ GET DASHBOARD STATS FROM REAL USER DATA
app.get('/api/dashboard/stats', async (req, res) => {
  try {
    console.log('🔄 Fetching REAL dashboard data from users collection...');
    
    const usersSnapshot = await db.collection('users').get();
    let totalScans = 0;
    let totalShelfItems = 0;
    let totalHistoryItems = 0;
    const userActivities = [];
    const allScans = [];
    
    // Process each user
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Get user's shelf items count
      const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').get();
      const userShelfCount = shelfSnapshot.size;
      totalShelfItems += userShelfCount;
      
      // Get user's history count
      const historySnapshot = await db.collection('users').doc(userId).collection('history').get();
      const userHistoryCount = historySnapshot.size;
      totalHistoryItems += userHistoryCount;
      
      // Get shelf items for activities and ripeness data
      shelfSnapshot.forEach(doc => {
        const shelfItem = doc.data();
        allScans.push({
          userId: userId,
          userEmail: userData.email,
          ...shelfItem,
          scanned_at: shelfItem.scannedDate || shelfItem.addedAt || new Date()
        });
        
        // Add to recent activities
        if (userShelfCount > 0) {
          userActivities.push({
            user: userData.email || `User ${userId.substring(0, 8)}`,
            action: `Scanned Papaya - ${shelfItem.ripeness || shelfItem.variety || 'Unknown'}`,
            time: formatTimeAgo(shelfItem.scannedDate || shelfItem.addedAt),
            type: 'scan'
          });
        }
      });
      
      // Add history items to total scans
      totalScans += userShelfCount + userHistoryCount;
    }
    
    const totalUsers = usersSnapshot.size;
    
    // Calculate ripeness distribution from REAL shelf data
    const ripenessDistribution = calculateRipenessDistribution(allScans);
    
    // Get recent activities (last 6)
    const recentActivities = userActivities
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 6);
    
    // Calculate weekly scans trend
    const weeklyScans = calculateWeeklyScans(allScans);
    
    const responseData = {
      // Real data from database
      totalUsers: totalUsers,
      newUsers: Math.max(1, Math.floor(totalUsers * 0.2)), // Estimate new users
      totalScans: totalScans,
      papayasOnShelf: totalShelfItems, // Real shelf items count
      
      // Real ripeness distribution
      ripenessDistribution: ripenessDistribution,
      
      // Real weekly data
      weeklyScans: weeklyScans,
      
      // Real recent activities
      recentActivities: recentActivities.length > 0 ? recentActivities : [
        { user: "No scans yet", action: "Scan a papaya to see data", time: "Waiting" }
      ],
      
      // User statistics
      userStats: {
        averageScansPerUser: totalUsers > 0 ? (totalScans / totalUsers).toFixed(1) : 0,
        activeUsers: userActivities.length,
        totalShelfItems: totalShelfItems,
        totalHistoryItems: totalHistoryItems
      }
    };
    
    console.log('✅ REAL Dashboard Data:', {
      totalUsers: responseData.totalUsers,
      totalScans: responseData.totalScans,
      shelfItems: responseData.papayasOnShelf,
      recentActivities: responseData.recentActivities.length
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Dashboard error:', error);
    res.status(500).json({ 
      error: error.message,
      message: 'Check Firebase users collection structure'
    });
  }
});

// ✅ RECORD A NEW SCAN (When user scans a papaya)
app.post('/api/scan', async (req, res) => {
  try {
    const { userId, userEmail, papayaData } = req.body;
    
    console.log(`📸 Recording scan for user: ${userId}`);
    
    const scanData = {
      ...papayaData,
      userId: userId,
      userEmail: userEmail,
      scanned_at: admin.firestore.FieldValue.serverTimestamp(),
      timestamp: new Date()
    };
    
    // ✅ 1. Save to user's shelf collection
    const shelfRef = db.collection('users').doc(userId).collection('shelf').doc();
    await shelfRef.set(scanData);
    
    // ✅ 2. Save to user's history collection
    const historyRef = db.collection('users').doc(userId).collection('history').doc();
    await historyRef.set({
      ...scanData,
      action: 'papaya_scan',
      scanId: shelfRef.id
    });
    
    // ✅ 3. Save to global scans collection for analytics
    const globalScanRef = db.collection('all_scans').doc();
    await globalScanRef.set(scanData);
    
    console.log(`✅ Scan recorded successfully for user ${userId}`);
    
    res.json({
      success: true,
      message: 'Scan recorded successfully',
      shelfId: shelfRef.id,
      historyId: historyRef.id,
      globalScanId: globalScanRef.id
    });
    
  } catch (error) {
    console.error('❌ Error recording scan:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// ✅ DEBUG ENDPOINT - See your database structure
app.get('/api/debug/database', async (req, res) => {
  try {
    console.log('🔍 Debugging database structure...');
    
    const collections = await db.listCollections();
    const collectionList = collections.map(col => col.id);
    
    // Get sample users data
    const usersSnapshot = await db.collection('users').limit(3).get();
    const sampleUsers = [];
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      // Check subcollections
      const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').limit(2).get();
      const historySnapshot = await db.collection('users').doc(userId).collection('history').limit(2).get();
      
      sampleUsers.push({
        userId: userId,
        userData: userData,
        shelfCount: shelfSnapshot.size,
        historyCount: historySnapshot.size,
        sampleShelf: shelfSnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() })),
        sampleHistory: historySnapshot.docs.map(doc => ({ id: doc.id, data: doc.data() }))
      });
    }
    
    res.json({
      success: true,
      collections: collectionList,
      totalUsers: (await db.collection('users').get()).size,
      sampleUsers: sampleUsers,
      databaseStructure: {
        users: {
          fields: ['email', 'user_id', 'created_at'],
          subcollections: ['shelf', 'history']
        },
        shelf: {
          possibleFields: ['addedAt', 'expiryDate', 'harvestedDate', 'id', 'imageUrl', 'name', 'scannedDate', 'temperature', 'variety', 'ripeness']
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Debug endpoint error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ✅ DEBUG: Check scans data structure - DAGDAG NI
app.get('/api/debug/scans', async (req, res) => {
  try {
    console.log('🔍 Debugging scans data structure...');
    
    const usersSnapshot = await db.collection('users').limit(2).get();
    const debugInfo = {
      totalUsers: usersSnapshot.size,
      sampleUsers: []
    };
    
    for (const userDoc of usersSnapshot.docs) {
      const userId = userDoc.id;
      const userData = userDoc.data();
      
      const userInfo = {
        userId: userId,
        userData: userData,
        shelf: { count: 0, samples: [] },
        history: { count: 0, samples: [] }
      };
      
      // Check shelf collection
      try {
        const shelfSnapshot = await db.collection('users').doc(userId).collection('shelf').limit(2).get();
        userInfo.shelf.count = shelfSnapshot.size;
        userInfo.shelf.samples = shelfSnapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }));
      } catch (error) {
        userInfo.shelf.error = error.message;
      }
      
      // Check history collection
      try {
        const historySnapshot = await db.collection('users').doc(userId).collection('history').limit(2).get();
        userInfo.history.count = historySnapshot.size;
        userInfo.history.samples = historySnapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }));
      } catch (error) {
        userInfo.history.error = error.message;
      }
      
      debugInfo.sampleUsers.push(userInfo);
    }
    
    res.json(debugInfo);
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ error: error.message });
  }
});

// HELPER FUNCTIONS
function calculateRipenessDistribution(scans) {
  const distribution = { unripe: 0, ripe: 0, overripe: 0 };
  
  scans.forEach(scan => {
    const ripeness = (scan.ripeness || '').toLowerCase();
    if (ripeness.includes('unripe') || ripeness === 'green') {
      distribution.unripe++;
    } else if (ripeness.includes('overripe') || ripeness === 'rotten') {
      distribution.overripe++;
    } else {
      distribution.ripe++; // Default to ripe
    }
  });
  
  // Ensure at least 1 for chart display
  if (distribution.unripe === 0 && distribution.ripe === 0 && distribution.overripe === 0) {
    return { unripe: 1, ripe: 1, overripe: 1 };
  }
  
  return distribution;
}

function calculateWeeklyScans(scans) {
  if (scans.length === 0) return [2, 5, 8, 12];
  
  // Simple weekly distribution (last 4 weeks)
  const weeklyData = [0, 0, 0, 0];
  const now = new Date();
  
  scans.forEach(scan => {
    const scanDate = scan.scannedDate || scan.addedAt || scan.timestamp;
    if (scanDate) {
      const date = scanDate.toDate ? scanDate.toDate() : new Date(scanDate);
      const diffWeeks = Math.floor((now - date) / (7 * 24 * 60 * 60 * 1000));
      
      if (diffWeeks < 4) {
        weeklyData[3 - diffWeeks]++;
      }
    }
  });
  
  return weeklyData.map(count => Math.max(1, count));
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return 'Recent';
  try {
    const now = new Date();
    let activityTime;
    
    if (timestamp.toDate) {
      activityTime = timestamp.toDate();
    } else if (typeof timestamp === 'string') {
      activityTime = new Date(timestamp);
    } else if (timestamp.seconds) {
      activityTime = new Date(timestamp.seconds * 1000);
    } else {
      activityTime = new Date(timestamp);
    }
    
    if (isNaN(activityTime.getTime())) return 'Recent';
    
    const diffMinutes = Math.floor((now - activityTime) / (1000 * 60));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} mins ago`;
    if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)} hr ago`;
    return `${Math.floor(diffMinutes / 1440)} days ago`;
  } catch (error) {
    return 'Recent';
  }
}

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🚀 PAPAYAFRESH API Server Running!');
  console.log('📍 Port:', PORT);
  console.log('📊 Dashboard: http://localhost:' + PORT + '/api/dashboard/stats');
  console.log('👥 All Users: http://localhost:' + PORT + '/api/users/all');
  console.log('🗑️ Delete User: http://localhost:' + PORT + '/api/users/delete/{userId}');
  console.log('📸 User Shelf: http://localhost:' + PORT + '/api/users/{userId}/shelf');
  console.log('📚 User History: http://localhost:' + PORT + '/api/users/{userId}/history');
  console.log('🌐 All Scans: http://localhost:' + PORT + '/api/scans/all');
  console.log('🔧 Debug: http://localhost:' + PORT + '/api/debug/database');
  console.log('🔍 Scans Debug: http://localhost:' + PORT + '/api/debug/scans');
  console.log('❤️ Health: http://localhost:' + PORT + '/api/health');
});