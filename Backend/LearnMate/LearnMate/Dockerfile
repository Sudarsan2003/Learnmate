# -----------------------------
# Build Stage
# -----------------------------
FROM maven:3.9.9-eclipse-temurin-17 AS build

WORKDIR /app

COPY pom.xml .
COPY .mvn .mvn
COPY mvnw .
RUN chmod +x mvnw

COPY src src

RUN ./mvnw clean package -DskipTests

# -----------------------------
# Runtime Stage
# -----------------------------
FROM eclipse-temurin:17-jre

WORKDIR /app

# Install OCR and PDF utilities
RUN apt-get update && \
    apt-get install -y \
        tesseract-ocr \
        libtesseract-dev \
        tesseract-ocr-eng \
        tesseract-ocr-hin \
        tesseract-ocr-tel \
        poppler-utils && \
    rm -rf /var/lib/apt/lists/*

# Optional: verify installation
RUN tesseract --version

COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

ENTRYPOINT ["java", "-jar", "app.jar"]