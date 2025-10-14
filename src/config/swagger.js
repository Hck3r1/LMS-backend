const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'MIC Oyo State LMS API',
      version: '1.0.0',
      description: 'A comprehensive API for managing MIC Oyo State IT courses, students, tutors, and assignments',
      contact: {
        name: 'MIC Oyo State Support',
        email: 'support@mic.oyostate.gov.ng'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:5000/api',
        description: 'Development server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      },
      schemas: {
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'User ID'
            },
            firstName: {
              type: 'string',
              description: 'User first name'
            },
            lastName: {
              type: 'string',
              description: 'User last name'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            role: {
              type: 'string',
              enum: ['student', 'tutor', 'admin'],
              description: 'User role'
            },
            specialization: {
              type: 'string',
              enum: ['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design'],
              description: 'User specialization (for tutors)'
            },
            avatar: {
              type: 'string',
              description: 'User avatar URL'
            },
            bio: {
              type: 'string',
              description: 'User bio'
            },
            skills: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'User skills'
            }
          }
        },
        Course: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Course ID'
            },
            title: {
              type: 'string',
              description: 'Course title'
            },
            description: {
              type: 'string',
              description: 'Course description'
            },
            category: {
              type: 'string',
              enum: ['web-development', 'ui-ux', 'data-science', 'video-editing', 'graphics-design'],
              description: 'Course category'
            },
            instructor: {
              $ref: '#/components/schemas/User'
            },
            thumbnail: {
              type: 'string',
              description: 'Course thumbnail URL'
            },
            duration: {
              type: 'number',
              description: 'Course duration in hours'
            },
            difficulty: {
              type: 'string',
              enum: ['beginner', 'intermediate', 'advanced'],
              description: 'Course difficulty level'
            },
            price: {
              type: 'number',
              description: 'Course price'
            },
            isPublished: {
              type: 'boolean',
              description: 'Whether course is published'
            },
            rating: {
              type: 'object',
              properties: {
                average: {
                  type: 'number',
                  description: 'Average rating'
                },
                count: {
                  type: 'number',
                  description: 'Number of ratings'
                }
              }
            }
          }
        },
        Module: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Module ID'
            },
            courseId: {
              type: 'string',
              description: 'Course ID'
            },
            title: {
              type: 'string',
              description: 'Module title'
            },
            description: {
              type: 'string',
              description: 'Module description'
            },
            order: {
              type: 'number',
              description: 'Module order'
            },
            content: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  type: {
                    type: 'string',
                    enum: ['video', 'pdf', 'text', 'assignment', 'quiz', 'link', 'image']
                  },
                  title: {
                    type: 'string'
                  },
                  url: {
                    type: 'string'
                  },
                  duration: {
                    type: 'number'
                  },
                  isRequired: {
                    type: 'boolean'
                  }
                }
              }
            },
            estimatedTime: {
              type: 'number',
              description: 'Estimated time in minutes'
            },
            isPublished: {
              type: 'boolean',
              description: 'Whether module is published'
            }
          }
        },
        Assignment: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Assignment ID'
            },
            moduleId: {
              type: 'string',
              description: 'Module ID'
            },
            courseId: {
              type: 'string',
              description: 'Course ID'
            },
            title: {
              type: 'string',
              description: 'Assignment title'
            },
            description: {
              type: 'string',
              description: 'Assignment description'
            },
            instructions: {
              type: 'string',
              description: 'Assignment instructions'
            },
            type: {
              type: 'string',
              enum: ['file_upload', 'text_submission', 'code_submission', 'quiz', 'project'],
              description: 'Assignment type'
            },
            dueDate: {
              type: 'string',
              format: 'date-time',
              description: 'Assignment due date'
            },
            maxPoints: {
              type: 'number',
              description: 'Maximum points'
            },
            isPublished: {
              type: 'boolean',
              description: 'Whether assignment is published'
            }
          }
        },
        Submission: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Submission ID'
            },
            assignmentId: {
              type: 'string',
              description: 'Assignment ID'
            },
            studentId: {
              $ref: '#/components/schemas/User'
            },
            files: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  filename: {
                    type: 'string'
                  },
                  url: {
                    type: 'string'
                  },
                  fileType: {
                    type: 'string'
                  },
                  fileSize: {
                    type: 'number'
                  }
                }
              }
            },
            textSubmission: {
              type: 'string',
              description: 'Text submission content'
            },
            submittedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Submission timestamp'
            },
            status: {
              type: 'string',
              enum: ['draft', 'submitted', 'under_review', 'graded', 'returned'],
              description: 'Submission status'
            },
            grade: {
              type: 'number',
              description: 'Submission grade'
            },
            feedback: {
              type: 'object',
              properties: {
                general: {
                  type: 'string'
                },
                strengths: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                },
                improvements: {
                  type: 'array',
                  items: {
                    type: 'string'
                  }
                }
              }
            }
          }
        },
        Error: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              description: 'Error message'
            },
            error: {
              type: 'string',
              description: 'Detailed error information'
            }
          }
        }
      }
    },
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./src/routes/*.js'] // Path to the API docs
};

const specs = swaggerJsdoc(options);

module.exports = {
  swaggerUi,
  specs
};