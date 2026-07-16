FROM node:20-slim

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port (Hugging Face defaults to 7860, others to PORT env)
EXPOSE 7860

CMD ["npm", "start"]
