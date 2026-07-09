package com.learnmate.learnmateai.model;

import com.pgvector.PGvector;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

import java.sql.SQLException;

@Converter
public class PGvectorConverter implements AttributeConverter<PGvector, String> {

    @Override
    public String convertToDatabaseColumn(PGvector attribute) {
        return attribute == null ? null : attribute.toString(); // e.g. "[0.1,0.2,...]"
    }

    @Override
    public PGvector convertToEntityAttribute(String dbData) {
        if (dbData == null) return null;
        try {
            return new PGvector(dbData);
        } catch (SQLException e) {
            throw new RuntimeException(e);
        }
    }
}