const express = require('express');
const path = require('path');
const helmet = require('helmet');
const xss = require('xss-clean');
const mongoSanitize = require('express-mongo-sanitize');
const compression = require('compression');
const cors = require('cors');
const passport = require('passport');
const httpStatus = require('http-status');
const config = require('./config/config');
const morgan = require('./config/morgan');
const { jwtStrategy } = require('./config/passport');
const { authLimiter } = require('./middlewares/rateLimiter');
const routes = require('./routes/v1');
const { errorConverter, errorHandler } = require('./middlewares/error');
const ApiError = require('./utils/ApiError');

const app = express();

// view engine: handlebars (hbs)
try {
  // Lazy require so the app can still load without install, but will error on render
  // eslint-disable-next-line global-require
  const hbs = require('hbs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.set('view engine', 'hbs');
  hbs.registerPartials(path.join(__dirname, '..', 'views', 'partials'));
  hbs.registerHelper('eq', (a, b) => a === b);
} catch (e) {
  // If hbs is not installed yet, skip engine setup to avoid crashing other endpoints
}

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "https://cdnjs.cloudflare.com",
          "https://cdn.jsdelivr.net",
          "https://ajax.googleapis.com",
          "https://maps.googleapis.com",
          "https://maps.gstatic.com",
          "https://apis.google.com",
          "https://www.google-analytics.com",
          "'unsafe-inline'",
          "'unsafe-eval'"
        ],
        styleSrc: [
          "'self'",
          "https://fonts.googleapis.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "'unsafe-inline'"
        ],
        fontSrc: [
          "'self'",
          "https://fonts.gstatic.com",
          "https://cdn.jsdelivr.net",
          "https://cdnjs.cloudflare.com",
          "data:"
        ],
        imgSrc: [
          "'self'",
          "data:",
          "https://maps.googleapis.com",
          "https://maps.gstatic.com",
          "https://www.google-analytics.com"
        ],
        connectSrc: [
          "'self'",
          "https://www.google-analytics.com",
          "https://maps.googleapis.com"
        ],
        workerSrc: ["'self'", "blob:"], // ✅ allows confetti
        objectSrc: ["'none'"],
        upgradeInsecureRequests: []
      }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

// parse json request body
app.use(express.json());

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// sanitize request data
app.use(xss());
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// enable cors
app.use(cors());
app.options('*', cors());

// static assets (for CSS/JS)
app.use(express.static(path.join(__dirname, '..', 'public')));


// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// template locals
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  next();
});

// v1 api routes
app.use('/v1', routes);

try {
  // eslint-disable-next-line global-require
  const pagesRouter = require('./routes/pages/wedding.route');
  app.use('/', pagesRouter);
} catch (e) {
  // pages router optional
}

// family routes mounted at /family
try {
  // eslint-disable-next-line global-require
  const familyRouter = require('./routes/pages/family.route');
  app.use('/family', familyRouter);
} catch (e) {
  // family router optional
}

try {
  const faxRouter = require('./routes/pages/fax.route');
  app.use('/', faxRouter);
} catch (e) {
  // optional
}

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

module.exports = app;
