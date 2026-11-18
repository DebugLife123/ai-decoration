package com.decoration.saas;

import com.decoration.shared.api.BusinessApiException;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.sql.DriverManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

@SpringBootTest(webEnvironment=SpringBootTest.WebEnvironment.RANDOM_PORT, properties="server.address=127.0.0.1")
class PersonalCreditServiceIntegrationTest {
    private static final String GATEWAY_KEY = UUID.randomUUID().toString();
    @org.springframework.boot.test.web.server.LocalServerPort int port;
    private static final String TEST_SCHEMA = "decoration_credit_test_" + UUID.randomUUID().toString().replace("-", "");
    private static final String DATABASE_URL = env("DATABASE_TEST_URL", "jdbc:postgresql://localhost:5432/decoration");
    private static final String DATABASE_USERNAME = env("DATABASE_TEST_USERNAME", env("DATABASE_USERNAME", "decoration"));
    private static final String DATABASE_PASSWORD = env("DATABASE_TEST_PASSWORD", env("DATABASE_PASSWORD", "decoration"));

    @DynamicPropertySource
    static void configureDatabase(DynamicPropertyRegistry registry) {
        registry.add("CREDIT_GATEWAY_SECRET", () -> GATEWAY_KEY);
        var separator = DATABASE_URL.contains("?") ? "&" : "?";
        registry.add("spring.datasource.url", () -> DATABASE_URL + separator + "currentSchema=" + TEST_SCHEMA);
        registry.add("spring.datasource.username", () -> DATABASE_USERNAME);
        registry.add("spring.datasource.password", () -> DATABASE_PASSWORD);
        registry.add("spring.flyway.schemas", () -> TEST_SCHEMA);
        registry.add("spring.flyway.default-schema", () -> TEST_SCHEMA);
    }

    @AfterAll
    static void dropTestSchema() throws Exception {
        try (var connection = DriverManager.getConnection(DATABASE_URL, DATABASE_USERNAME, DATABASE_PASSWORD);
             var statement = connection.createStatement()) {
            statement.execute("drop schema if exists " + TEST_SCHEMA + " cascade");
        }
    }

    @Autowired private JdbcTemplate jdbc;
    @Autowired private PersonalCreditService service;
    private UUID userId;

    @BeforeEach
    void createUser() {
        jdbc.update("delete from auth_users where role = 'PERSONAL_USER'");
        userId = UUID.randomUUID();
        jdbc.update("""
                insert into auth_users(id, email, password_hash, display_name, account_type, role, created_at)
                values (?, ?, 'test-hash', '积分测试用户', 'PERSONAL', 'PERSONAL_USER', ?)
                """, userId, "credit-" + userId + "@example.com", Timestamp.from(Instant.now()));
    }

    @Test
    void reserveIsIdempotentAndFailureRefundsExactlyOnce() {
        service.grant(userId, 500, "测试发放");
        var first = service.reserve(userId, "generation:test-refund", 100);
        var duplicate = service.reserve(userId, "generation:test-refund", 100);

        assertEquals(first.id(), duplicate.id());
        assertEquals(700, service.summary(userId).account().balance());

        service.finalizeOperation(userId, first.id(), false);
        service.finalizeOperation(userId, first.id(), false);

        assertEquals(800, service.summary(userId).account().balance());
        assertEquals(4, service.summary(userId).entries().size());
    }

    @Test
    void successfulGenerationKeepsReservedCreditsDeducted() {
        service.grant(userId, 300, "测试发放");
        var operation = service.reserve(userId, "generation:test-success", 100);

        service.finalizeOperation(userId, operation.id(), true);

        assertEquals(500, service.summary(userId).account().balance());
        assertEquals("COMMITTED", service.finalizeOperation(userId, operation.id(), false).status());
    }

    @Test
    void insufficientBalanceRejectsReservationWithoutLedgerEntry() {
        var exception = assertThrows(BusinessApiException.class,
                () -> service.reserve(userId, "generation:test-insufficient", 301));

        assertEquals("INSUFFICIENT_CREDITS", exception.code());
        assertEquals(300, service.summary(userId).account().balance());
        assertEquals(1, service.summary(userId).entries().size());
    }

    @Test
    void concurrentDuplicateReserveAndRefundRemainIdempotent() throws Exception {
        service.grant(userId, 500, "测试发放");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> {
                start.await();
                return service.reserve(userId, "generation:concurrent", 100);
            });
            var second = executor.submit(() -> {
                start.await();
                return service.reserve(userId, "generation:concurrent", 100);
            });
            start.countDown();
            var firstOperation = first.get(10, TimeUnit.SECONDS);
            var secondOperation = second.get(10, TimeUnit.SECONDS);
            assertEquals(firstOperation.id(), secondOperation.id());
            assertEquals(700, service.summary(userId).account().balance());

            var refundStart = new CountDownLatch(1);
            var firstRefund = executor.submit(() -> {
                refundStart.await();
                return service.finalizeOperation(userId, firstOperation.id(), false);
            });
            var secondRefund = executor.submit(() -> {
                refundStart.await();
                return service.finalizeOperation(userId, firstOperation.id(), false);
            });
            refundStart.countDown();
            assertEquals("REFUNDED", firstRefund.get(10, TimeUnit.SECONDS).status());
            assertEquals("REFUNDED", secondRefund.get(10, TimeUnit.SECONDS).status());
        }

        assertEquals(800, service.summary(userId).account().balance());
        assertEquals(4, service.summary(userId).entries().size());
    }

    @Test void partialSettlementRefundsOnlyUnusedUnitsOnce() {
        var op = service.reserve(userId, "partial", 300);
        service.settle(userId, op.id(), 150L);
        service.settle(userId, op.id(), 0L);
        assertEquals(150, service.summary(userId).account().balance());
        assertEquals(3, service.summary(userId).entries().size());
    }

    @Test void registrationBudgetAndGatewaySettlementOverHttp() throws Exception {
        var client = java.net.http.HttpClient.newHttpClient();
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper();
        var base = "http://127.0.0.1:" + port;
        var register = java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/api/v1/auth/register"))
            .header("Content-Type","application/json").POST(java.net.http.HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(java.util.Map.of(
                "email",UUID.randomUUID()+"@example.test","password","Qa-Only-1118!","accountType","PERSONAL","displayName","QA")))).build();
        var registered=client.send(register,java.net.http.HttpResponse.BodyHandlers.ofString());
        assertEquals(201,registered.statusCode());
        var auth=mapper.readTree(registered.body()).get("data");
        var owner=auth.get("user").get("id").asText();
        var read=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/internal/wallet/"+owner));
        assertEquals(403,client.send(read.header("X-Wallet-Key","invalid").GET().build(),java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode());
        var budget=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/api/v1/budgets/estimate")).header("Content-Type","application/json")
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString("{\"area\":90,\"finishLevel\":\"STANDARD\",\"pricingMode\":\"LIST\"}")).build();
        var estimate=client.send(budget,java.net.http.HttpResponse.BodyHandlers.ofString());
        assertEquals(200,estimate.statusCode());
        org.junit.jupiter.api.Assertions.assertTrue(mapper.readTree(estimate.body()).at("/data/payableTotalLow").asDouble()>0);
        var reserve=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/internal/wallet/reserve")).header("X-Wallet-Key",GATEWAY_KEY).header("Content-Type","application/json")
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(java.util.Map.of("owner",owner,"key","http-test","label","QA","units",100)))).build();
        var reserved=client.send(reserve,java.net.http.HttpResponse.BodyHandlers.ofString());
        assertEquals(200,reserved.statusCode());
        var id=mapper.readTree(reserved.body()).at("/data/id").asText();
        var settle=java.net.http.HttpRequest.newBuilder(java.net.URI.create(base+"/internal/wallet/settle")).header("X-Wallet-Key",GATEWAY_KEY).header("Content-Type","application/json")
            .POST(java.net.http.HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(java.util.Map.of("owner",owner,"id",id,"consumed",50)))).build();
        for(int i=0;i<2;i++) assertEquals(200,client.send(settle,java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode());
        var result=client.send(read.setHeader("X-Wallet-Key",GATEWAY_KEY).GET().build(),java.net.http.HttpResponse.BodyHandlers.ofString());
        assertEquals(2.5,mapper.readTree(result.body()).at("/data/summary/balance").asDouble());
    }

    private static String env(String name, String fallback) {
        var value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }
}
