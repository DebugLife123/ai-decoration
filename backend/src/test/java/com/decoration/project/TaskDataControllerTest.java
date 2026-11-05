package com.decoration.project;

import com.decoration.shared.api.ApiExceptionHandler;
import com.decoration.shared.security.SecurityConfiguration;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(TaskDataController.class)
@Import({ApiExceptionHandler.class, SecurityConfiguration.class})
class TaskDataControllerTest {
    private static final UUID PERSONAL_ID = UUID.fromString("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa");
    private static final UUID PROJECT_ID = UUID.fromString("11111111-1111-4111-8111-111111111111");
    private static final UUID TASK_ID = UUID.fromString("22222222-2222-4222-8222-222222222222");

    @Autowired private MockMvc mockMvc;
    @MockBean private ProjectHistoryService historyService;
    @MockBean private TaskLifecycleService lifecycleService;

    @Test
    void enqueuesRenderAndReturnsTaskLocationForScopedOwner() throws Exception {
        var task = JsonNodeFactory.instance.objectNode().put("id", TASK_ID.toString())
                .put("projectId", PROJECT_ID.toString()).put("taskType", "RENDER").put("status", "QUEUED");
        given(historyService.createTask(eq(PERSONAL_ID), eq(PROJECT_ID), eq("RENDER"), any())).willReturn(task);

        mockMvc.perform(post("/api/v1/projects/{projectId}/renders", PROJECT_ID)
                        .with(jwt().jwt(token -> token.subject(PERSONAL_ID.toString()).claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER")))
                        .contentType("application/json")
                        .content("{\"style\":\"modern\"}"))
                .andExpect(status().isAccepted())
                .andExpect(header().string("Location", "/api/v1/tasks/" + TASK_ID))
                .andExpect(jsonPath("$.data.status").value("QUEUED"));
        verify(historyService).createTask(eq(PERSONAL_ID), eq(PROJECT_ID), eq("RENDER"), any());
    }

    @Test
    void taskLookupUsesAuthenticatedOwner() throws Exception {
        given(lifecycleService.get(PERSONAL_ID, TASK_ID)).willReturn(JsonNodeFactory.instance.objectNode()
                .put("id", TASK_ID.toString()).put("status", "QUEUED"));

        mockMvc.perform(get("/api/v1/tasks/{taskId}", TASK_ID)
                        .with(jwt().jwt(token -> token.subject(PERSONAL_ID.toString()).claim("roles", List.of("PERSONAL_USER")))
                                .authorities(new SimpleGrantedAuthority("ROLE_PERSONAL_USER"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(TASK_ID.toString()));
        verify(lifecycleService).get(PERSONAL_ID, TASK_ID);
    }
}
