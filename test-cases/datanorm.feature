Feature: Data normalization of customer records

  Rule: Apply transformations to a loaded CSV

    Background:
      Given "datanorm-input.csv" is loaded
      And the golden output is "datanorm-expected.jsonl"

    @headless @cli @web
    Scenario Outline: Normalize <column>
      When user requests "<command>"
      Then column "<column>" matches the golden output

      Examples:
        | column  | command                 |
        | Phone   | Normalize phone numbers |
        | Country | Normalize country names |
        | DOB     | Normalize DOB formats   |

    @headless @cli @web
    Scenario: Full normalization round-trip
      Given Phone, Country, and DOB are normalized
      When user requests to export as "datanorm-output.jsonl"
      Then "datanorm-output.jsonl" matches the golden output ignoring "Notes"

  Rule: Surface-specific UX flows

    @web
    Scenario: Load CSV via Open File dialog
      Given the TableTamer web app
      When user says "Load CSV file"
      Then display Open File dialog
      When user selects "datanorm-input.csv"
      Then table displays the header and at least the first 5 rows

    @web
    Scenario: Save flow via Save File dialog
      Given Phone, Country, and DOB are normalized
      When user says "Save flow"
      Then display Save File dialog
      When user saves as "datanorm.flow"
      Then "datanorm.flow" contains normalization steps

    @cli
    Scenario: Execute saved flow from command line
      Given "datanorm.flow" exists
      And the golden output is "datanorm-expected.jsonl"
      When user runs "tabletamer execute datanorm.flow --input datanorm-input.csv --output datanorm-output.jsonl"
      Then "datanorm-output.jsonl" matches the golden output ignoring "Notes"
