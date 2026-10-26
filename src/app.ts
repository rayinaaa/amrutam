import express, { Express, Request, Response } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { observabilityMiddleware } from './interfaces/http/middleware/observability.middleware';
import { errorHandler } from './interfaces/http/middleware/error-handler.middleware';
import { setupSwagger } from './interfaces/http/swagger';
import { healthRoutes } from './interfaces/http/routes/health.routes';
import { authRoutes } from './interfaces/http/routes/auth.routes';
import { doctorRoutes } from './interfaces/http/routes/doctor.routes';
import { bookingRoutes } from './interfaces/http/routes/booking.routes';
import { consultationRoutes } from './interfaces/http/routes/consultation.routes';
import { prescriptionRoutes } from './interfaces/http/routes/prescription.routes';
import { analyticsRoutes } from './interfaces/http/routes/analytics.routes';

export function createApp(): Express {
  const app = express();

  // Security headers & CORS
  app.use(helmet({
    contentSecurityPolicy: false, // Allows Swagger UI inline scripts
  }));
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Idempotency-Key', 'traceparent'],
  }));

  // Body parser
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Observability: W3C distributed tracing, Prometheus duration histogram, JSON access log
  app.use(observabilityMiddleware);

  // Health and Metrics endpoints
  app.use('/', healthRoutes);

  // Interactive Swagger UI documentation
  setupSwagger(app);

  // API v1 Routes
  const apiV1 = express.Router();
  apiV1.use('/auth', authRoutes);
  apiV1.use('/doctors', doctorRoutes);
  apiV1.use('/bookings', bookingRoutes);
  apiV1.use('/consultations', consultationRoutes);
  apiV1.use('/prescriptions', prescriptionRoutes);
  apiV1.use('/analytics', analyticsRoutes);

  app.use(config.API_PREFIX, apiV1);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: `Route ${req.method} ${req.originalUrl} not found`,
      },
    });
  });

  // Global centralized error handler
  app.use(errorHandler);

  return app;
}
