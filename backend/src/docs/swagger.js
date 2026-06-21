const swaggerDocument = {
  openapi: "3.0.0",
  info: {
    title: "SplitWise Pro API Documentation",
    version: "1.0.0",
    description: "Production grade full stack Expense Split Calculator REST APIs"
  },
  servers: [
    {
      url: "/api",
      description: "Base API Path"
    }
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT"
      }
    }
  },
  security: [
    {
      BearerAuth: []
    }
  ],
  paths: {
    "/auth/register": {
      post: {
        summary: "Register new user",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                  password: { type: "string" }
                },
                required: ["name", "email", "password"]
              }
            }
          }
        },
        responses: {
          201: { description: "User registered. OTP sent to email." }
        }
      }
    },
    "/auth/login": {
      post: {
        summary: "Authenticate user and get JWT",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  email: { type: "string" },
                  password: { type: "string" }
                },
                required: ["email", "password"]
              }
            }
          }
        },
        responses: {
          200: { description: "Tokens returned successfully" }
        }
      }
    },
    "/groups": {
      post: {
        summary: "Create a sharing group",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  category: { type: "string", enum: ["home", "trip", "couple", "other", "general"] }
                },
                required: ["name"]
              }
            }
          }
        },
        responses: {
          201: { description: "Group created successfully" }
        }
      },
      get: {
        summary: "Get user groups list",
        responses: {
          200: { description: "List of groups" }
        }
      }
    },
    "/groups/{id}": {
      get: {
        summary: "Get group details, members, balances, and optimized suggested settlements",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" }
          }
        ],
        responses: {
          200: { description: "Detailed group information" }
        }
      }
    },
    "/expenses": {
      post: {
        summary: "Create a group expense",
        description: "Supports Equal, Exact, Percentage, and Shares splits, as well as multiple payers",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  groupId: { type: "string" },
                  title: { type: "string" },
                  amount: { type: "number" },
                  splitMethod: { type: "string", enum: ["equal", "exact", "percentage", "shares"] },
                  paidBy: { type: "string", description: "Payer userId or Array of payers" },
                  participants: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        user: { type: "string" },
                        value: { type: "number" }
                      }
                    }
                  }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Expense added" }
        }
      }
    },
    "/settlements": {
      post: {
        summary: "Log a payment settlement between two users",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  groupId: { type: "string" },
                  toUserId: { type: "string" },
                  amount: { type: "number" },
                  transactionRef: { type: "string" }
                }
              }
            }
          }
        },
        responses: {
          201: { description: "Settlement logged" }
        }
      }
    },
    "/analytics/dashboard": {
      get: {
        summary: "Get general dashboard stats",
        responses: {
          200: { description: "Dashboard counters and logs" }
        }
      }
    },
    "/analytics/spending": {
      get: {
        summary: "Get spending trends by category and month",
        responses: {
          200: { description: "Category stats and monthly timeline" }
        }
      }
    }
  }
};

module.exports = swaggerDocument;
