require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Group = require('./src/models/Group');
const GroupMember = require('./src/models/GroupMember');
const Expense = require('./src/models/Expense');
const ExpenseParticipant = require('./src/models/ExpenseParticipant');
const Settlement = require('./src/models/Settlement');
const logger = require('./src/utils/logger');
const connectDB = require('./src/config/db');

const seedData = async () => {
  try {
    await connectDB();

    // Clear existing database
    logger.info('Clearing existing database collections...');
    await User.deleteMany({});
    await Group.deleteMany({});
    await GroupMember.deleteMany({});
    await Expense.deleteMany({});
    await ExpenseParticipant.deleteMany({});
    await Settlement.deleteMany({});

    // 1. Create Users
    logger.info('Seeding users...');
    const rahul = new User({ name: 'Rahul Singh', email: 'rahul@example.com', passwordHash: 'password123', isVerified: true });
    const aman = new User({ name: 'Aman Verma', email: 'aman@example.com', passwordHash: 'password123', isVerified: true });
    const ravi = new User({ name: 'Ravi Kumar', email: 'ravi@example.com', passwordHash: 'password123', isVerified: true });
    const neha = new User({ name: 'Neha Joshi', email: 'neha@example.com', passwordHash: 'password123', isVerified: true });
    const pooja = new User({ name: 'Pooja Karan', email: 'pooja@example.com', passwordHash: 'password123', isVerified: true });
    const sysAdmin = new User({ name: 'System Admin', email: 'admin@example.com', passwordHash: 'admin123', role: 'admin', isVerified: true });

    await rahul.save();
    await aman.save();
    await ravi.save();
    await neha.save();
    await pooja.save();
    await sysAdmin.save();

    // 2. Create Groups
    logger.info('Seeding groups...');
    const goaTrip = new Group({ name: 'Goa Trip', description: 'Fun summer beach vacation', category: 'trip', createdBy: rahul._id });
    const roommates = new Group({ name: 'Roommates', description: 'Monthly apartment splits', category: 'home', createdBy: rahul._id });

    await goaTrip.save();
    await roommates.save();

    // 3. Create Group Members
    logger.info('Adding members to groups...');
    const members = [
      // Goa Trip members
      { group: goaTrip._id, user: rahul._id, role: 'admin' },
      { group: goaTrip._id, user: aman._id, role: 'member' },
      { group: goaTrip._id, user: ravi._id, role: 'member' },
      { group: goaTrip._id, user: neha._id, role: 'member' },
      { group: goaTrip._id, user: pooja._id, role: 'member' },
      // Roommates members
      { group: roommates._id, user: rahul._id, role: 'admin' },
      { group: roommates._id, user: aman._id, role: 'member' },
      { group: roommates._id, user: neha._id, role: 'member' },
    ];

    await GroupMember.insertMany(members);

    // 4. Seeding Expenses
    logger.info('Seeding expenses...');
    // Expense 1: Hotel Booking (Goa Trip) - 12,500 paid by Rahul, split equally among all 5
    const hotelExp = new Expense({
      group: goaTrip._id,
      title: 'Hotel Booking',
      amount: 12500,
      category: 'travel',
      splitMethod: 'equal',
      createdBy: rahul._id
    });
    await hotelExp.save();

    const hotelParts = [
      { expense: hotelExp._id, user: rahul._id, paidAmount: 12500, owedAmount: 2500 },
      { expense: hotelExp._id, user: aman._id, paidAmount: 0, owedAmount: 2500 },
      { expense: hotelExp._id, user: ravi._id, paidAmount: 0, owedAmount: 2500 },
      { expense: hotelExp._id, user: neha._id, paidAmount: 0, owedAmount: 2500 },
      { expense: hotelExp._id, user: pooja._id, paidAmount: 0, owedAmount: 2500 },
    ];
    await ExpenseParticipant.insertMany(hotelParts);

    // Expense 2: Dinner (Goa Trip) - 3,000 paid by Ravi, split equally among all 5
    const dinnerExp = new Expense({
      group: goaTrip._id,
      title: 'Dinner at Beach Shack',
      amount: 3000,
      category: 'food',
      splitMethod: 'equal',
      createdBy: ravi._id
    });
    await dinnerExp.save();

    const dinnerParts = [
      { expense: dinnerExp._id, user: rahul._id, paidAmount: 0, owedAmount: 600 },
      { expense: dinnerExp._id, user: aman._id, paidAmount: 0, owedAmount: 600 },
      { expense: dinnerExp._id, user: ravi._id, paidAmount: 3000, owedAmount: 600 },
      { expense: dinnerExp._id, user: neha._id, paidAmount: 0, owedAmount: 600 },
      { expense: dinnerExp._id, user: pooja._id, paidAmount: 0, owedAmount: 600 },
    ];
    await ExpenseParticipant.insertMany(dinnerParts);

    // Expense 3: Taxi Fare (Goa Trip) - 1,500 paid by Neha, split equally among all 5
    const taxiExp = new Expense({
      group: goaTrip._id,
      title: 'Taxi Ride',
      amount: 1500,
      category: 'travel',
      splitMethod: 'equal',
      createdBy: neha._id
    });
    await taxiExp.save();

    const taxiParts = [
      { expense: taxiExp._id, user: rahul._id, paidAmount: 0, owedAmount: 300 },
      { expense: taxiExp._id, user: aman._id, paidAmount: 0, owedAmount: 300 },
      { expense: taxiExp._id, user: ravi._id, paidAmount: 0, owedAmount: 300 },
      { expense: taxiExp._id, user: neha._id, paidAmount: 1500, owedAmount: 300 },
      { expense: taxiExp._id, user: pooja._id, paidAmount: 0, owedAmount: 300 },
    ];
    await ExpenseParticipant.insertMany(taxiParts);

    // 5. Seeding Settlements
    logger.info('Seeding settlements...');
    // Aman pays Rahul 2,000 to clear partial hotel debt
    const set1 = new Settlement({
      group: goaTrip._id,
      fromUser: aman._id,
      toUser: rahul._id,
      amount: 2000,
      status: 'completed',
      transactionRef: 'UPI-983942001'
    });
    await set1.save();

    logger.info('Database seeded successfully!');
    mongoose.connection.close();
  } catch (error) {
    logger.error('Failed to seed database: ', error);
    process.exit(1);
  }
};

seedData();
