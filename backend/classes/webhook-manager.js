const axios = require('axios');
const dbInstance = require('../db');
const EventEmitter = require('events');

class WebhookManager {
    constructor() {
        if (WebhookManager.instance) {
            return WebhookManager.instance;
        }

        this.eventEmitter = new EventEmitter();
        this.setupEventListeners();
        WebhookManager.instance = this;
    }

    setupEventListeners() {
        // Adding event listeners for different events
        this.eventEmitter.on('playback_started', async (data) => {
            await this.triggerEventWebhooks('playback_started', data);
        });

        this.eventEmitter.on('playback_ended', async (data) => {
            await this.triggerEventWebhooks('playback_ended', data);
        });

        this.eventEmitter.on('media_recently_added', async (data) => {
            await this.triggerEventWebhooks('media_recently_added', data);
        });

        // If needed, add more event listeners here
    }

    async getWebhooksByEventType(eventType) {
        return await dbInstance.query(
            'SELECT * FROM webhooks WHERE trigger_type = $1 AND event_type = $2 AND enabled = true',
            ['event', eventType]
        ).then(res => res.rows);
    }

    async getScheduledWebhooks() {
        return await dbInstance.query(
            'SELECT * FROM webhooks WHERE trigger_type = $1 AND enabled = true',
            ['scheduled']
        ).then(res => res.rows);
    }

    async triggerEventWebhooks(eventType, data = {}) {
        try {
            const webhooks = await this.getWebhooksByEventType(eventType);
            
            if (webhooks.length === 0) {
                console.log(`[WEBHOOK] No webhooks registered for event: ${eventType}`);
                return;
            }
            
            console.log(`[WEBHOOK] Triggering ${webhooks.length} webhooks for event: ${eventType}`);
            
            const enrichedData = {
                ...data,
                event: eventType,
                triggeredAt: new Date().toISOString()
            };
            
            const promises = webhooks.map(webhook => {
                return this.executeWebhook(webhook, enrichedData);
            });
            
            await Promise.all(promises);
            
            return true;
        } catch (error) {
            console.error(`[WEBHOOK] Error triggering webhooks for event ${eventType}:`, error);
            return false;
        }
    }

    async executeWebhook(webhook, data = {}) {
        try {
            let headers = {};
            let payload = {};

            const isDiscordWebhook = webhook.url.includes('discord.com/api/webhooks');

            try {
                headers = typeof webhook.headers === 'string'
                    ? JSON.parse(webhook.headers || '{}')
                    : (webhook.headers || {});

                payload = typeof webhook.payload === 'string'
                    ? JSON.parse(webhook.payload || '{}')
                    : (webhook.payload || {});
            } catch (e) {
                console.error("[WEBHOOK] Error while parsing:", e);
                return false;
            }

            if (isDiscordWebhook) {
                console.log("[WEBHOOK] Webhook Discord detected");

                await axios({
                    method: webhook.method || 'POST',
                    url: webhook.url,
                    headers: { 'Content-Type': 'application/json' },
                    data: payload,
                    timeout: 10000
                });

                console.log(`[WEBHOOK] Discord webhook ${webhook.name} send successfully`);
            } else {
                const compiledPayload = this.compileTemplate(payload, data);

                await axios({
                    method: webhook.method || 'POST',
                    url: webhook.url,
                    headers,
                    data: compiledPayload,
                    timeout: 10000
                });

                console.log(`[WEBHOOK] Webhook ${webhook.name} send successfully`);
            }

            //Update the last triggered timestamp
            await dbInstance.query(
                'UPDATE webhooks SET last_triggered = NOW() WHERE id = $1',
                [webhook.id]
            );

            return true;
        } catch (error) {
            console.error(`[WEBHOOK] Error triggering webhook ${webhook.name}:`, error.message);
            if (error.response) {
                console.error(`[WEBHOOK] Response status: ${error.response.status}`);
                console.error(`[WEBHOOK] Response data:`, error.response.data);
            }
            return false;
        }
    }

        compileTemplate(template, data) {
        if (typeof template === 'object') {
            return Object.keys(template).reduce((result, key) => {
                result[key] = this.compileTemplate(template[key], data);
                return result;
            }, {});
        } else if (typeof template === 'string') {
            // Replace {{variable}} with the corresponding value from data
            return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
                const keys = path.trim().split('.');
                let value = data;

                for (const key of keys) {
                    if (value === undefined) return match;
                    value = value[key];
                }

                return value !== undefined ? value : match;
            });
        }

        return template;
    }

    async triggerEvent(eventType, eventData = {}) {
        try {
            const webhooks = this.eventWebhooks?.[eventType] || [];
            
            if (webhooks.length === 0) {
                console.log(`[WEBHOOK] No webhooks registered for event: ${eventType}`);
                return;
            }
            
            console.log(`[WEBHOOK] Triggering ${webhooks.length} webhooks for event: ${eventType}`);
            
            const promises = webhooks.map(webhook => {
                return this.webhookManager.executeWebhook(webhook, {
                    ...eventData,
                    event: eventType,
                    triggeredAt: new Date().toISOString()
                });
            });
            
            await Promise.all(promises);
        } catch (error) {
            console.error(`[WEBHOOK] Error triggering webhooks for event ${eventType}:`, error);
        }
    }

    emitEvent(eventType, data) {
        this.eventEmitter.emit(eventType, data);
    }

    async getTopWatchedContent(contentType, period = 'month', limit = 5) {
        // Calculate period start date
        const today = new Date();
        let startDate;

        if (period === 'month') {
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        } else if (period === 'week') {
            const day = today.getDay();
            startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day - 7);
        } else {
            startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        }

        const formattedStartDate = startDate.toISOString().split('T')[0];

        // SQL query to get top watched content
        let query;
        if (contentType === 'movie') {
            query = `
                SELECT
                    "NowPlayingItemName" as title,
                    COUNT(DISTINCT "UserId") as unique_viewers,
                    SUM("PlaybackDuration") / 60000 as total_minutes
                FROM jf_playback_activity
                WHERE "ActivityDateInserted" >= $1
                  AND "NowPlayingItemName" IS NOT NULL
                  AND "SeriesName" IS NULL
                GROUP BY "NowPlayingItemName", "NowPlayingItemId"
                ORDER BY total_minutes DESC
                LIMIT $2
            `;
        } else if (contentType === 'series') {
            query = `
                SELECT
                    "SeriesName" as title,
                    COUNT(DISTINCT "UserId") as unique_viewers,
                    SUM("PlaybackDuration") / 60000 as total_minutes
                FROM jf_playback_activity
                WHERE "ActivityDateInserted" >= $1
                  AND "SeriesName" IS NOT NULL
                GROUP BY "SeriesName"
                ORDER BY total_minutes DESC
                LIMIT $2
            `;
        }

        try {
            const result = await dbInstance.query(query, [formattedStartDate, limit]);
            return result.rows || [];
        } catch (error) {
            console.error(`[WEBHOOK] SQL ERROR (${contentType}):`, error.message);
            return [];
        }
    }

    async getMonthlySummaryData() {
        try {
            // Get the top watched movies and series
            const topMovies = await this.getTopWatchedContent('movie', 'month', 5);
            const topSeries = await this.getTopWatchedContent('series', 'month', 5);

            const prevMonth = new Date();
            prevMonth.setMonth(prevMonth.getMonth() - 1);
            const prevMonthStart = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), 1);
            const prevMonthEnd = new Date(prevMonth.getFullYear(), prevMonth.getMonth() + 1, 0);

            const formattedStart = prevMonthStart.toISOString().split('T')[0];
            const formattedEnd = prevMonthEnd.toISOString().split('T')[0];

            // Get general statistics
            const statsQuery = `
                SELECT
                    COUNT(DISTINCT "UserId") as active_users,
                    COUNT(*) as total_plays,
                    SUM("PlaybackDuration") / 3600000 as total_hours
                FROM jf_playback_activity
                WHERE "ActivityDateInserted" BETWEEN $1 AND $2
            `;

            const statsResult = await dbInstance.query(statsQuery, [formattedStart, formattedEnd]);
            const generalStats = statsResult.rows[0] || {
                active_users: 0,
                total_plays: 0,
                total_hours: 0
            };

            return {
                period: {
                    start: formattedStart,
                    end: formattedEnd,
                    name: prevMonth.toLocaleString('fr-FR', { month: 'long', year: 'numeric' })
                },
                topMovies,
                topSeries,
                stats: generalStats
            };
        } catch (error) {
            console.error("[WEBHOOK] Error while getting data:", error.message);
            throw error;
        }
    }

        async triggerMonthlySummaryWebhook(webhookId) {
        try {
            // Get the webhook details
            const result = await dbInstance.query(
                'SELECT * FROM webhooks WHERE id = $1 AND enabled = true',
                [webhookId]
            );

            if (result.rows.length === 0) {
                console.error(`[WEBHOOK] Webhook ID ${webhookId} not found or disable`);
                return false;
            }

            const webhook = result.rows[0];

            // Generate the monthly summary data
            try {
                const data = await this.getMonthlySummaryData();

                const moviesFields = data.topMovies.map((movie, index) => ({
                    name: `${index + 1}. ${movie.title}`,
                    value: `${Math.round(movie.total_minutes)} minutes • ${movie.unique_viewers} viewers`,
                    inline: false
                }));

                const seriesFields = data.topSeries.map((series, index) => ({
                    name: `${index + 1}. ${series.title}`,
                    value: `${Math.round(series.total_minutes)} minutes • ${series.unique_viewers} viewers`,
                    inline: false
                }));

                const monthlyPayload = {
                    content: `📊 **Monthly Report - ${data.period.name}**`,
                    embeds: [
                        {
                            title: "🎬 Most Watched Movies",
                            color: 15844367,
                            fields: moviesFields.length > 0 ? moviesFields : [{ name: "No data", value: "No movies watch this month" }]
                        },
                        {
                            title: "📺 Most Watched Series",
                            color: 5793266,
                            fields: seriesFields.length > 0 ? seriesFields : [{ name: "No data", value: "No Series watch this month" }]
                        },
                        {
                            title: "📈 General Statistics",
                            color: 5763719,
                            fields: [
                                {
                                    name: "Active Users",
                                    value: `${data.stats.active_users || 0}`,
                                    inline: true
                                },
                                {
                                    name: "Total Plays",
                                    value: `${data.stats.total_plays || 0}`,
                                    inline: true
                                },
                                {
                                    name: "Total Hours Watched",
                                    value: `${Math.round(data.stats.total_hours || 0)}`,
                                    inline: true
                                }
                            ],
                            footer: {
                                text: `Period: from ${new Date(data.period.start).toLocaleDateString('en-US')} to ${new Date(data.period.end).toLocaleDateString('en-US')}`
                            }
                        }
                    ]
                };

                // Send the webhook
                await axios({
                    method: webhook.method || 'POST',
                    url: webhook.url,
                    headers: { 'Content-Type': 'application/json' },
                    data: monthlyPayload,
                    timeout: 10000
                });

                console.log(`[WEBHOOK] Monthly report webhook ${webhook.name} sent successfully`);

                // Update the last triggered timestamp
                await dbInstance.query(
                    'UPDATE webhooks SET last_triggered = NOW() WHERE id = $1',
                    [webhook.id]
                );

                return true;
            } catch (dataError) {
                console.error(`[WEBHOOK] Error while preparing the data:`, dataError.message);
                return false;
            }
        } catch (error) {
            console.error(`[WEBHOOK] Error while sending the monthly report:`, error.message);
            return false;
        }
    }

    async executeDiscordWebhook(webhook, data) {
        try {
            console.log(`Execution of discord webhook: ${webhook.name}`);

            const response = await axios.post(webhook.url, data, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            console.log(`[WEBHOOK] Discord response: ${response.status}`);
            return response.status >= 200 && response.status < 300;
        } catch (error) {
            console.error(`[WEBHOOK] Error with Discord webhook ${webhook.name}:`, error.message);
            if (error.response) {
                console.error('[WEBHOOK] Response status:', error.response.status);
                console.error('[WEBHOOK] Response data:', error.response.data);
            }
            return false;
        }
    }
}

module.exports = WebhookManager;