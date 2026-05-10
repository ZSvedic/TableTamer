Feature: Data normalization of customer records

  Background:
    Given "customers-raw.csv" exists

  @web
  Scenario: Normalize DOB, Country, and Phone fields
    Given the TableTamer web app
    When user says "Load CSV file"
    Then display Open File dialog
    When user selects "customers-raw.csv"
    Then load "customers-raw.csv"
    And table displays the header and at least the first 5 rows of "customers-raw.csv"
    When user says "Normalize phone numbers"
    Then transform numbers in the Phone column to E.164 format
    When user says "Normalize country names"
    Then transform names in the Country column to standard English names
    When user says "Normalize DOB formats"
    Then transform dates in the DOB column to ISO 8601 format
    When user says "Export normalized data"
    Then display Save File dialog
    When user saves as "customers.jsonl"
    Then all records in "customers.jsonl" match "customers-normalized.jsonl" ignoring the "Notes" field
    When user says "Save flow"
    Then display Save File dialog
    When user saves as "customers-normalization.flow"
    Then "customers-normalization.flow" contains normalization steps

  @cli
  Scenario: Execute saved flow
    Given the TableTamer CLI
    And "customers-normalization.flow" exists
    When user runs "tabletamer execute customers-normalization.flow --input customers-raw.csv --output customers.jsonl"
    Then all records in "customers.jsonl" match "customers-normalized.jsonl" ignoring the "Notes" field