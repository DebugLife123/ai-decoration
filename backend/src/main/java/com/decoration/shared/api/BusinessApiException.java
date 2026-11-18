package com.decoration.shared.api;

import org.springframework.http.HttpStatus;

public class BusinessApiException extends RuntimeException {
    private final HttpStatus status;
    private final String code;
    private final Object data;

    public BusinessApiException(HttpStatus status, String code, String message) {
        this(status, code, message, null);
    }

    public BusinessApiException(HttpStatus status, String code, String message, Object data) {
        super(message);
        this.status = status;
        this.code = code;
        this.data = data;
    }

    public HttpStatus status() {
        return status;
    }

    public String code() {
        return code;
    }

    public Object data() { return data; }
}
