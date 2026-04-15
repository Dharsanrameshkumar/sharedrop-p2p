# Build Stage
FROM maven:3.9.6-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# Build the application without running tests to speed up deployment
RUN mvn clean package -DskipTests

# Run Stage
FROM eclipse-temurin:17-jre
WORKDIR /app
# Copy the compiled executable JAR from the build stage
COPY --from=build /app/target/*.jar app.jar
# Expose the standard backend port
EXPOSE 8080
# Run the application
ENTRYPOINT ["java", "-jar", "app.jar"]
