#!/usr/bin/env node

/**
 * ============================================================================
 * E-Commerce Platform - Docker Health Check
 * ============================================================================
 * Script de verificación de salud para contenedores Docker
 * Puede usarse como HEALTHCHECK en Dockerfiles
 * ============================================================================
 */

const http = require('http');
const https = require('https');
const net = require('net');
const { exec } = require('child_process');
const util = require('util');

const execAsync = util.promisify(exec);

// ============================================================================
// Configuración
// ============================================================================

const CONFIG = {
    // Timeout para checks en ms
    timeout: parseInt(process.env.HEALTH_TIMEOUT, 10) || 5000,
    
    // Puerto del servicio a verificar
    port: parseInt(process.env.HEALTH_PORT, 10) || 3000,
    
    // Host a verificar
    host: process.env.HEALTH_HOST || 'localhost',
    
    // Path del endpoint de health
    path: process.env.HEALTH_PATH || '/health',
    
    // Usar HTTPS
    useHttps: process.env.HEALTH_HTTPS === 'true',
    
    // Tipo de check: http, tcp, command
    checkType: process.env.HEALTH_CHECK_TYPE || 'http',
    
    // Comando personalizado para check tipo command
    command: process.env.HEALTH_COMMAND,
    
    // Verbose mode
    verbose: process.env.HEALTH_VERBOSE === 'true',
};

// ============================================================================
// Utilidades
// ============================================================================

function log(message) {
    if (CONFIG.verbose) {
        console.log(`[health-check] ${message}`);
    }
}

function logError(message) {
    console.error(`[health-check] ERROR: ${message}`);
}

// ============================================================================
// Checks de salud
// ============================================================================

/**
 * Check HTTP/HTTPS
 * Realiza una petición HTTP al endpoint de health
 */
async function checkHttp() {
    return new Promise((resolve, reject) => {
        const protocol = CONFIG.useHttps ? https : http;
        const options = {
            host: CONFIG.host,
            port: CONFIG.port,
            path: CONFIG.path,
            method: 'GET',
            timeout: CONFIG.timeout,
            headers: {
                'User-Agent': 'Docker-Health-Check/1.0',
            },
        };

        log(`Checking HTTP ${CONFIG.useHttps ? 'HTTPS' : 'HTTP'}://${CONFIG.host}:${CONFIG.port}${CONFIG.path}`);

        const request = protocol.request(options, (response) => {
            const statusCode = response.statusCode;
            
            log(`Response status: ${statusCode}`);
            
            // Consumir datos para liberar la conexión
            response.on('data', () => {});
            
            response.on('end', () => {
                if (statusCode >= 200 && statusCode < 300) {
                    resolve({ status: 'healthy', statusCode });
                } else {
                    reject(new Error(`HTTP ${statusCode}`));
                }
            });
        });

        request.on('error', (error) => {
            reject(error);
        });

        request.on('timeout', () => {
            request.destroy();
            reject(new Error('Request timeout'));
        });

        request.end();
    });
}

/**
 * Check TCP
 * Verifica si el puerto TCP está abierto y acepta conexiones
 */
async function checkTcp() {
    return new Promise((resolve, reject) => {
        log(`Checking TCP ${CONFIG.host}:${CONFIG.port}`);

        const socket = new net.Socket();
        let resolved = false;

        socket.setTimeout(CONFIG.timeout);

        socket.on('connect', () => {
            resolved = true;
            socket.destroy();
            resolve({ status: 'healthy', port: CONFIG.port });
        });

        socket.on('error', (error) => {
            if (!resolved) {
                resolved = true;
                reject(error);
            }
        });

        socket.on('timeout', () => {
            if (!resolved) {
                resolved = true;
                socket.destroy();
                reject(new Error('TCP connection timeout'));
            }
        });

        socket.connect(CONFIG.port, CONFIG.host);
    });
}

/**
 * Check por comando
 * Ejecuta un comando personalizado y verifica el exit code
 */
async function checkCommand() {
    if (!CONFIG.command) {
        throw new Error('HEALTH_COMMAND not set');
    }

    log(`Executing command: ${CONFIG.command}`);

    try {
        const { stdout, stderr } = await execAsync(CONFIG.command, {
            timeout: CONFIG.timeout,
        });
        
        log(`Command output: ${stdout}`);
        
        if (stderr) {
            log(`Command stderr: ${stderr}`);
        }

        return { status: 'healthy', output: stdout.trim() };
    } catch (error) {
        throw new Error(`Command failed: ${error.message}`);
    }
}

/**
 * Check de dependencias
 * Verifica que las dependencias del servicio estén disponibles
 */
async function checkDependencies() {
    const dependencies = [];
    
    // Verificar PostgreSQL
    if (process.env.DATABASE_URL) {
        dependencies.push(checkDatabasePostgres());
    }
    
    // Verificar MongoDB
    if (process.env.MONGODB_URI) {
        dependencies.push(checkDatabaseMongo());
    }
    
    // Verificar Redis
    if (process.env.REDIS_URL) {
        dependencies.push(checkCacheRedis());
    }
    
    // Verificar RabbitMQ
    if (process.env.RABBITMQ_URL) {
        dependencies.push(checkMessageBroker());
    }
    
    if (dependencies.length === 0) {
        return { status: 'healthy', message: 'No dependencies configured' };
    }
    
    const results = await Promise.allSettled(dependencies);
    const failed = results.filter(r => r.status === 'rejected');
    
    if (failed.length > 0) {
        throw new Error(`Dependencies check failed: ${failed.map(f => f.reason.message).join(', ')}`);
    }
    
    return { status: 'healthy', dependencies: results.length };
}

/**
 * Check de PostgreSQL
 */
async function checkDatabasePostgres() {
    const { Client } = require('pg');
    
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: CONFIG.timeout,
    });
    
    try {
        await client.connect();
        const result = await client.query('SELECT 1');
        await client.end();
        
        if (result.rowCount === 1) {
            return { status: 'healthy', database: 'postgresql' };
        }
        throw new Error('PostgreSQL query failed');
    } catch (error) {
        throw new Error(`PostgreSQL check failed: ${error.message}`);
    }
}

/**
 * Check de MongoDB
 */
async function checkDatabaseMongo() {
    const { MongoClient } = require('mongodb');
    
    const client = new MongoClient(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: CONFIG.timeout,
    });
    
    try {
        await client.connect();
        await client.db().admin().ping();
        await client.close();
        
        return { status: 'healthy', database: 'mongodb' };
    } catch (error) {
        throw new Error(`MongoDB check failed: ${error.message}`);
    }
}

/**
 * Check de Redis
 */
async function checkCacheRedis() {
    const redis = require('redis');
    
    const client = redis.createClient({
        url: process.env.REDIS_URL,
        socket: {
            connectTimeout: CONFIG.timeout,
        },
    });
    
    try {
        await client.connect();
        const result = await client.ping();
        await client.disconnect();
        
        if (result === 'PONG') {
            return { status: 'healthy', cache: 'redis' };
        }
        throw new Error('Redis ping failed');
    } catch (error) {
        throw new Error(`Redis check failed: ${error.message}`);
    }
}

/**
 * Check de RabbitMQ
 */
async function checkMessageBroker() {
    const amqp = require('amqplib');
    
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL);
        await connection.close();
        
        return { status: 'healthy', broker: 'rabbitmq' };
    } catch (error) {
        throw new Error(`RabbitMQ check failed: ${error.message}`);
    }
}

// ============================================================================
// Función principal de health check
// ============================================================================

async function performHealthCheck() {
    log(`Starting health check (type: ${CONFIG.checkType})`);
    
    let result;
    
    switch (CONFIG.checkType) {
        case 'http':
        case 'https':
            result = await checkHttp();
            break;
            
        case 'tcp':
            result = await checkTcp();
            break;
            
        case 'command':
            result = await checkCommand();
            break;
            
        case 'dependencies':
            result = await checkDependencies();
            break;
            
        default:
            throw new Error(`Unknown check type: ${CONFIG.checkType}`);
    }
    
    return result;
}

// ============================================================================
// Manejo de resultados
// ============================================================================

function handleSuccess(result) {
    const output = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        check: CONFIG.checkType,
        ...result,
    };
    
    log(`Health check passed: ${JSON.stringify(output)}`);
    
    console.log(JSON.stringify(output, null, 2));
    process.exit(0);
}

function handleError(error) {
    const output = {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        check: CONFIG.checkType,
        error: error.message,
    };
    
    logError(`Health check failed: ${error.message}`);
    
    console.error(JSON.stringify(output, null, 2));
    process.exit(1);
}

// ============================================================================
// CLI y ejecución
// ============================================================================

function parseArgs() {
    const args = process.argv.slice(2);
    const options = {};
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '-p':
            case '--port':
                options.port = parseInt(args[++i], 10);
                break;
            case '-h':
            case '--host':
                options.host = args[++i];
                break;
            case '-t':
            case '--timeout':
                options.timeout = parseInt(args[++i], 10);
                break;
            case '--path':
                options.path = args[++i];
                break;
            case '--type':
                options.checkType = args[++i];
                break;
            case '-v':
            case '--verbose':
                options.verbose = true;
                break;
            case '--help':
                showHelp();
                process.exit(0);
                break;
        }
    }
    
    return options;
}

function showHelp() {
    console.log(`
Docker Health Check Script

Usage: node docker-health-check.js [options]

Options:
  -p, --port PORT       Port to check (default: 3000)
  -h, --host HOST       Host to check (default: localhost)
  -t, --timeout MS      Timeout in milliseconds (default: 5000)
  --path PATH           Health endpoint path (default: /health)
  --type TYPE           Check type: http, tcp, command, dependencies
  -v, --verbose         Enable verbose logging
  --help                Show this help

Environment Variables:
  HEALTH_PORT           Port to check
  HEALTH_HOST           Host to check
  HEALTH_TIMEOUT        Timeout in milliseconds
  HEALTH_PATH           Health endpoint path
  HEALTH_HTTPS          Use HTTPS (true/false)
  HEALTH_CHECK_TYPE     Type of check
  HEALTH_COMMAND        Command for command check
  HEALTH_VERBOSE        Enable verbose logging

Examples:
  node docker-health-check.js
  node docker-health-check.js -p 8080 -t 10000
  node docker-health-check.js --type tcp -p 5432
  node docker-health-check.js --type command --command "pg_isready"
`);
}

// ============================================================================
// Main
// ============================================================================

async function main() {
    // Parsear argumentos de línea de comandos
    const cliOptions = parseArgs();
    
    // Mezclar configuración
    Object.assign(CONFIG, cliOptions);
    
    try {
        const result = await performHealthCheck();
        handleSuccess(result);
    } catch (error) {
        handleError(error);
    }
}

// Ejecutar
main();

// ============================================================================
// Exportar para uso como módulo
// ============================================================================

module.exports = {
    performHealthCheck,
    checkHttp,
    checkTcp,
    checkCommand,
    checkDependencies,
    CONFIG,
};
