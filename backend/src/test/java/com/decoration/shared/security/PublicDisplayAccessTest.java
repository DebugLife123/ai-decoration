package com.decoration.shared.security;

import com.decoration.business.PublicCaseCatalogController;
import com.decoration.business.PublicCaseCatalogService;
import com.decoration.business.PublicCompanyController;
import com.decoration.business.PublicCompanyService;
import com.decoration.business.BusinessAssetService;
import com.decoration.material.MaterialCatalogController;
import com.decoration.material.MaterialCatalogService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest({PublicCaseCatalogController.class, PublicCompanyController.class, MaterialCatalogController.class})
@Import(SecurityConfiguration.class)
class PublicDisplayAccessTest {
    @Autowired MockMvc mvc;
    @MockBean PublicCaseCatalogService cases;
    @MockBean PublicCompanyService companies;
    @MockBean MaterialCatalogService materials;
    @MockBean BusinessAssetService assets;

    @Test void anonymousVisitorsCanReadDisplayCatalogs() throws Exception {
        mvc.perform(get("/api/v1/cases")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/materials")).andExpect(status().isOk());
        mvc.perform(get("/api/v1/companies/00000000-0000-4000-8000-000000000001")).andExpect(status().isOk());
    }

    @Test void anonymousVisitorsCannotWriteOrReadPrivateData() throws Exception {
        mvc.perform(post("/api/v1/cases")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/materials")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/budgets/estimate").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/v1/inquiries").contentType("application/json").content("{}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/projects")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/admin/marketplace")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/business/assets/00000000-0000-4000-8000-000000000001")).andExpect(status().isUnauthorized());
    }
}
