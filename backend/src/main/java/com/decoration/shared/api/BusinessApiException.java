package com.decoration.shared.api;

import org.springframework.http.HttpStatus;

public class BusinessApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;

    public BusinessApiException(HttpStatus status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }
}
