import { Express } from 'express';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import fs from 'fs';

export function setupSwagger(app: Express): void {
  try {
    const yamlPath = path.resolve(__dirname, '../../../docs/openapi.yaml');
    if (fs.existsSync(yamlPath)) {
      const swaggerDocument = yaml.load(yamlPath);
      
      // Also generate docs/openapi.json if not present
      const jsonPath = path.resolve(__dirname, '../../../docs/openapi.json');
      fs.writeFileSync(jsonPath, JSON.stringify(swaggerDocument, null, 2));

      app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
        customCss: '.swagger-ui .topbar { display: none }',
        customSiteTitle: 'Amrutam Telemedicine API Docs',
      }));

      app.get('/api-docs.json', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerDocument);
      });
    }
  } catch (err: any) {
    console.warn('Failed to load Swagger documentation:', err.message);
  }
}
