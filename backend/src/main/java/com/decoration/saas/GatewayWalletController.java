package com.decoration.saas;

import com.decoration.shared.api.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;

/** Internal gateway operations; amounts are hundredths of one displayed credit. */
@RestController
@RequestMapping("/internal/wallet")
public class GatewayWalletController {
    private final PersonalCreditService wallet;
    private final JdbcTemplate db;
    private final String secret;
    public GatewayWalletController(PersonalCreditService wallet, JdbcTemplate db,
            @Value("${CREDIT_GATEWAY_SECRET:}") String secret) {
        this.wallet = wallet; this.db = db; this.secret = secret;
    }
    private void authenticate(String token) {
        if (secret.length() < 32 || token == null || !MessageDigest.isEqual(secret.getBytes(StandardCharsets.UTF_8), token.getBytes(StandardCharsets.UTF_8)))
            throw new BusinessApiException(HttpStatus.FORBIDDEN,"FORBIDDEN","Gateway credential required");
    }
    record Allocation(UUID owner, String key, long units, String label) {}
    record Settlement(UUID owner, UUID id, long consumed) {}
    @PostMapping("/reserve")
    @org.springframework.transaction.annotation.Transactional
    public Object reserve(@RequestHeader("X-Wallet-Key") String token, @RequestBody Allocation body) {
        authenticate(token);
        db.queryForObject("select id from auth_users where id=? for update",UUID.class,body.owner());
        if (Boolean.TRUE.equals(db.queryForObject("select exists(select 1 from personal_credit_operations where user_id=? and operation_key=?)",Boolean.class,body.owner(),body.key())))
            throw new BusinessApiException(HttpStatus.CONFLICT,"OPERATION_EXISTS","生成请求已处理，请读取原任务");
        var result=wallet.reserve(body.owner(), body.key(), body.units());
        db.update("update personal_credit_ledger set note=left(?,240) where operation_id=? and event_type='GENERATION_RESERVE'",body.label(),result.id());
        return ApiResponse.success(result);
    }
    @PostMapping("/settle")
    public Object settle(@RequestHeader("X-Wallet-Key") String token, @RequestBody Settlement body) {
        authenticate(token); return ApiResponse.success(wallet.settle(body.owner(), body.id(), body.consumed()));
    }
    @GetMapping("/{owner}")
    public Object ledger(@RequestHeader("X-Wallet-Key") String token, @PathVariable UUID owner) {
        authenticate(token);
        var rows = db.queryForList("""
            select l.id, l.created_at as at, l.delta / 100.0 as delta, l.balance_after / 100.0 as "balanceAfter",
            l.note as label, case when l.event_type='GENERATION_REFUND' then h.id end as "refId",
            case l.event_type when 'GENERATION_RESERVE' then 'hold' when 'GENERATION_REFUND' then 'refund' else 'grant' end as type,
            case o.status when 'RESERVED' then 'pending' when 'COMMITTED' then 'settled' when 'REFUNDED' then 'refunded' end as status
            from personal_credit_ledger l left join personal_credit_operations o on o.id=l.operation_id
            left join personal_credit_ledger h on h.operation_id=l.operation_id and h.event_type='GENERATION_RESERVE'
            where l.user_id=? order by l.created_at desc, l.id limit 100
            """, owner);
        var balance = db.queryForObject("select coalesce((select balance from personal_credit_accounts where user_id=?),0)/100.0",Double.class,owner);
        var pending = db.queryForObject("select coalesce(sum(units),0)/100.0 from personal_credit_operations where user_id=? and status='RESERVED'",Double.class,owner);
        return ApiResponse.success(Map.of("entries",rows,"summary", Map.of("userId", owner,"balance",balance,"pendingHolds",pending,"planId","free")));
    }
}
