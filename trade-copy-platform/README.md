# Trade Copy Platform

Enterprise-grade Trade Copy Platform for real-time trade synchronization, risk management, and account handling using a microservices architecture.

## 🌟 Overview

The Trade Copy Platform is a robust, scalable solution designed to securely copy trades across multiple accounts in real-time. Built entirely with TypeScript across the stack, it leverages a microservices architecture to ensure high availability, low latency, and fault tolerance.

## 🏗️ Architecture

The platform uses an NPM Workspaces monorepo structure, containing a React frontend and several Node.js/TypeScript backend services.

### Microservices

*   **API Gateway** (`services/api-gateway`): The central entry point for all client requests, handling routing, rate limiting, and request aggregation.
*   **Auth Service** (`services/auth-service`): Manages user authentication, authorization, and session handling.
*   **Account Service** (`services/account-service`): Handles user accounts, portfolio management, and platform configuration.
*   **Trade Sync Engine** (`services/trade-sync-engine`): The core engine responsible for receiving, processing, and distributing trade signals in real-time.
*   **Risk Engine** (`services/risk-engine`): Evaluates trades against predefined risk parameters and constraints before execution.
*   **Broker Adapters** (`services/broker-adapters`): Integration layer for connecting with external trading platforms and APIs.

### Frontend

*   **Admin Dashboard** (`frontend`): A modern, responsive React application built with Tailwind CSS and Vite. It provides comprehensive monitoring, analytics, account management, and configuration interfaces. 

### Shared Packages

*   **Shared Utils** (`packages/shared-utils`): Common utilities, logging mechanisms, custom errors, and shared types used across all microservices to maintain consistency.

## 🚀 Getting Started

### Prerequisites

*   Node.js (v20+ recommended)
*   npm (v9+)
*   Docker and Docker Compose

### Installation

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd trade-copy-platform
    ```

2.  **Install dependencies:**
    This project uses npm workspaces, so a single install command from the root will install dependencies for all packages and services.
    ```bash
    npm install
    ```

### Development

To start the local development environment:

1.  **Start Infrastructure Support:**
    Launch the required databases and message brokers (e.g., Redis, PostgreSQL) using Docker Compose.
    ```bash
    docker-compose up -d
    ```

2.  **Start the Frontend:**
    Runs the Vite React development server.
    ```bash
    npm run dev -w frontend
    ```

3.  **Start Backend Services:**
    (You can start specific services individually, or configure a script to run them all). For example, to run the auth service:
    ```bash
    npm run dev -w services/auth-service
    ```

*Note: For local development ease, authentication routing and token validation might be currently bypassed in the `auth-service`.*

## 🛠️ Technology Stack

*   **Language:** TypeScript (Strict Mode)
*   **Frontend:** React, React Router, Tailwind CSS, Zustand/Context API, Vite
*   **Backend:** Node.js, Hono / Express (or similar framework)
*   **Infrastructure:** Docker, Docker Compose
*   **Monorepo:** NPM Workspaces

## 🤝 Contributing

(To be defined in `CONTRIBUTING.md`)

## 📝 License

(To be defined)
