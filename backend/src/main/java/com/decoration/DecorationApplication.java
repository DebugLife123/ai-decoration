package com.decoration;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class DecorationApplication {

    public static void main(String[] args) {
        SpringApplication.run(DecorationApplication.class, args);
    }
}
