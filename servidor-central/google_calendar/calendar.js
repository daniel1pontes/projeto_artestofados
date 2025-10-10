const { google } = require('googleapis');
const path = require('path');
const fs = require('fs').promises;
const logger = require('../utils/logger');

class CalendarService {
  constructor() {
    this.calendar = null;
    this.auth = null;
    this.credentialsPath = path.join(__dirname, '../config/credentials.json');
    this.tokenPath = path.join(__dirname, '../config/token.json');
  }

  async initialize() {
    try {
      const credentials = await this.loadCredentials();
      
      const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
      
      this.auth = new google.auth.OAuth2(
        client_id,
        client_secret,
        redirect_uris[0]
      );

      // Tentar carregar token existente
      try {
        const token = await fs.readFile(this.tokenPath, 'utf-8');
        this.auth.setCredentials(JSON.parse(token));
      } catch (error) {
        logger.warn('Token não encontrado. Autenticação necessária.');
        return false;
      }

      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      logger.info('Google Calendar inicializado com sucesso');
      return true;

    } catch (error) {
      logger.error('Erro ao inicializar Google Calendar:', error);
      return false;
    }
  }

  async loadCredentials() {
    try {
      const content = await fs.readFile(this.credentialsPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      logger.error('Erro ao carregar credenciais do Google Calendar');
      throw new Error('Credenciais do Google Calendar não encontradas. Adicione o arquivo credentials.json em src/config/');
    }
  }

  async createEvent(eventData) {
    try {
      if (!this.calendar) {
        const initialized = await this.initialize();
        if (!initialized) {
          throw new Error('Google Calendar não inicializado');
        }
      }

      const event = {
        summary: eventData.summary || 'Reunião Artestofados',
        description: eventData.description || '',
        start: {
          dateTime: eventData.start.toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        end: {
          dateTime: this.calculateEndTime(eventData.start, eventData.duration || 60).toISOString(),
          timeZone: 'America/Sao_Paulo',
        },
        attendees: eventData.attendee ? [{ email: eventData.attendee }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 dia antes
            { method: 'popup', minutes: 30 }, // 30 minutos antes
          ],
        },
      };

      const response = await this.calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all',
      });

      logger.info(`Evento criado no Google Calendar: ${response.data.id}`);
      
      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink
      };

    } catch (error) {
      logger.error('Erro ao criar evento no Google Calendar:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async listEvents(maxResults = 10) {
    try {
      if (!this.calendar) {
        const initialized = await this.initialize();
        if (!initialized) {
          return [];
        }
      }

      const response = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: new Date().toISOString(),
        maxResults: maxResults,
        singleEvents: true,
        orderBy: 'startTime',
      });

      return response.data.items || [];

    } catch (error) {
      logger.error('Erro ao listar eventos:', error);
      return [];
    }
  }

  async updateEvent(eventId, updates) {
    try {
      if (!this.calendar) {
        await this.initialize();
      }

      const response = await this.calendar.events.patch({
        calendarId: 'primary',
        eventId: eventId,
        resource: updates,
      });

      logger.info(`Evento ${eventId} atualizado`);
      return { success: true, data: response.data };

    } catch (error) {
      logger.error('Erro ao atualizar evento:', error);
      return { success: false, error: error.message };
    }
  }

  async deleteEvent(eventId) {
    try {
      if (!this.calendar) {
        await this.initialize();
      }

      await this.calendar.events.delete({
        calendarId: 'primary',
        eventId: eventId,
      });

      logger.info(`Evento ${eventId} deletado`);
      return { success: true };

    } catch (error) {
      logger.error('Erro ao deletar evento:', error);
      return { success: false, error: error.message };
    }
  }

  calculateEndTime(startDate, durationMinutes) {
    const endDate = new Date(startDate);
    endDate.setMinutes(endDate.getMinutes() + durationMinutes);
    return endDate;
  }

  // Gerar URL de autenticação (para primeira configuração)
  getAuthUrl() {
    if (!this.auth) {
      throw new Error('Auth não inicializado');
    }

    const SCOPES = ['https://www.googleapis.com/auth/calendar'];
    
    return this.auth.generateAuthUrl({
      access_type: 'offline',
      scope: SCOPES,
    });
  }

  // Salvar token após autenticação
  async saveToken(code) {
    try {
      const { tokens } = await this.auth.getToken(code);
      this.auth.setCredentials(tokens);
      
      await fs.writeFile(this.tokenPath, JSON.stringify(tokens));
      logger.info('Token do Google Calendar salvo com sucesso');
      
      return true;
    } catch (error) {
      logger.error('Erro ao salvar token:', error);
      return false;
    }
  }
}

module.exports = CalendarService;