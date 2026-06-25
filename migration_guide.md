# SplitWise Pro - Migration & Security Architecture Guide

This guide details the security upgrades, the transition to the new database models, sequence flows, and workflows for **SplitWise Pro**.

---

## 1. Database Schema Migrations

### Migrating `User.refreshToken` to `User.sessions`
In the old schema, users only had a single `refreshToken` string. In the new schema, multi-device sessions are stored inside the `sessions` array.

#### Migration Script
Run the following script to migrate existing users in MongoDB to the new session format:

```javascript
// migrate_sessions.js
const mongoose = require('mongoose');
const User = require('./src/models/User');
require('dotenv').config();

const migrate = async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.');

  const users = await User.find({ refreshToken: { $ne: null } });
  console.log(`Found ${users.length} users with old refresh tokens.`);

  for (let user of users) {
    if (user.refreshToken && (!user.sessions || user.sessions.length === 0)) {
      user.sessions.push({
        refreshToken: user.refreshToken,
        deviceName: 'Legacy Active Session',
        platform: 'Unknown',
        ipAddress: '0.0.0.0',
        createdAt: new Date(),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // fallback 7 days
      });
      // Clear the legacy field
      user.set('refreshToken', undefined);
      await user.save();
      console.log(`Migrated user: ${user.email}`);
    }
  }

  console.log('Migration finished successfully.');
  await mongoose.disconnect();
};

migrate().catch(console.error);
```

---

## 2. Security Architecture Diagram
Below is the system security architecture depicting input validation, security headers, token verification, dynamic RBAC, and MongoDB layer data models.

```mermaid
graph TD
    Client[Flutter Client / Web App] -->|HTTPS Requests| Helmet[Helmet Security Headers HSTS, CSP, X-Frame]
    Helmet -->|Sanitized HTTP| Limiters[Rate Limiters Auth: 100 req/15m]
    Limiters -->|Valid IPs| Router[Express Router & Validators express-validator]
    Router -->|Validated Body/Params| Auth[Auth Middleware protect & verify session]
    Auth -->|Decoded JWT sessionId| RBAC[RBAC check authorize permission]
    RBAC -->|Authorized Role| Controller[API Controller Logic]
    Controller -->|Read/Write Operations| Mongoose[Mongoose Models]
    Mongoose -->|Index Queries| Mongo[(MongoDB Instance)]
    
    subgraph Token Verification
        Auth -->|Lookup Session| UserSessionCheck{Session exists & active?}
        UserSessionCheck -->|No| Reject401[401 Unauthorized]
        UserSessionCheck -->|Yes| RoutePass[Allow Controller Call]
    end
```

---

## 3. Authentication Sequence Diagram
This diagram shows the login, session generation, and token rotation flow (with Refresh Token Rotation and reuse protection).

```mermaid
sequenceDiagram
    autonumber
    actor User as Client App
    participant Server as Express Server
    participant DB as MongoDB
    participant Redis as UsedTokens (RTR Log)

    User->>Server: POST /api/auth/login {email, password}
    Server->>DB: Find user & verify password
    alt Password Match & Verified
        Server->>Server: Create new Session ID & sign Access + Refresh Tokens
        Server->>DB: Push session to user.sessions array
        Server-->>User: Return 200 OK {accessToken, refreshToken}
    else Password Match Fails
        Server->>DB: Increment failedLoginAttempts
        alt attempts >= 5
            Server->>DB: Set lockUntil = Date.now() + 15m
            Server-->>User: Return 423 Locked
        else
            Server-->>User: Return 401 Unauthorized
        end
    end

    Note over User, Redis: Token Rotation Flow (refreshing expired accessToken)
    User->>Server: POST /api/auth/refresh-token {refreshToken}
    Server->>Redis: Check if token exists in UsedRefreshToken collection
    alt Token Reused (Security Breach!)
        Server->>DB: Revoke all active sessions (clear user.sessions)
        Server->>DB: Log Audit Event: SECURITY_EVENT_TOKEN_REUSE
        Server-->>User: Return 401 Unauthorized (Force re-auth)
    else Token Valid
        Server->>DB: Find user by active session refreshToken
        Server->>Redis: Log old token in UsedRefreshToken (with TTL)
        Server->>Server: Generate new access & refresh tokens
        Server->>DB: Update active session with rotated refreshToken
        Server-->>User: Return 200 OK {accessToken, refreshToken}
    end
```

---

## 4. Authorization & Permission RBAC Flow
This diagram illustrates the role-based and group-based permission evaluations.

```mermaid
sequenceDiagram
    autonumber
    actor User as Group Admin / User
    participant Router as Route Handler
    participant Middleware as authorize(permission)
    participant DB as Database (GroupMember)
    participant Action as Controller Handler

    User->>Router: DELETE /api/groups/:id/members/:userId
    Router->>Middleware: Trigger authorize('REMOVE_MEMBER')
    Middleware->>Middleware: Fetch req.user.role
    alt System Admin
        Middleware->>Action: Pass request (authorized)
    else Regular User
        Middleware->>DB: Find GroupMember {group: id, user: user._id}
        DB-->>Middleware: Return group role (e.g. role='admin')
        alt role == 'admin' (Group Admin)
            Middleware->>Action: Pass request (authorized)
        else role == 'member'
            Middleware-->>User: Return 403 Forbidden (Access Denied)
        end
    end
```

---

## 5. Session Management Workflow
1. **Login**: Client registers/logs in -> Session is added -> JWT contains `sessionId`.
2. **Telemetry**: Client displays all active devices, showing `deviceName`, `platform`, `ipAddress`, and `lastUsedAt`.
3. **Revocation**: Client triggers revoke session -> Backend filters out session from `sessions` list -> Access token with that `sessionId` is immediately invalidated.
4. **Logout All**: Clears all entries in `user.sessions` -> Forcefully logs out all devices.

---

## 6. Admin Panel Workflow
- **Dashboard Telemetry**: Fetches real-time status of dependencies (MongoDB, Redis), host memory usage, and uptime.
- **Security Console**: Counts overall system failed login attempts, locked accounts, OTP abuses, and token reuse attacks.
- **User Activation Control**: Admin disables user -> sets `isDisabled = true`, terminates all active user sessions -> user blocked from making any subsequent API requests.
- **Audit Console**: Paginated audit list of actions (`REGISTER`, `LOGIN`, `LOGOUT`, `SECURITY_EVENT_TOKEN_REUSE`, `ADMIN_ACTION`).
