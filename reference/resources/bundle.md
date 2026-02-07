<!-- Source: https://hl7.org/fhir/R4/bundle.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 Bundle Resource

## Resource Overview

The Bundle resource is a container for a collection of resources. It is used across multiple scenarios including search results, history operations, message exchanges, clinical documents, atomic transactions, and resource storage.

- **Status**: Normative (from v4.0.0)
- **Maturity Level**: N (Normative)
- **ANSI Approved**: Yes

## Purpose and Use Cases

- Gathering resources meeting search criteria (searchset)
- Returning resource version history (history)
- Facilitating message-based exchanges (message)
- Grouping self-contained clinical documents (document)
- Executing atomic create/update/delete operations (transaction/batch)
- Persistent resource collections (collection)

## Bundle vs. Other Grouping

Bundles differ from contained resources: contained resources are 'in' the container resource, while a bundle is a collection of resources that can have an independent existence. Other grouping mechanisms (List, Group, Composition) use references rather than direct containment.

## Resource Structure and Elements

### Core Bundle Elements

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **identifier** | 0..1 | Identifier | Persistent bundle identifier; unchanged during server-to-server copying |
| **type** | 1..1 | code | Bundle purpose (Required). Values: document | message | transaction | transaction-response | batch | batch-response | history | searchset | collection |
| **timestamp** | 0..1 | instant | Assembly date/time |
| **total** | 0..1 | unsignedInt | Total match count (search/history only) |
| **link** | 0..* | BackboneElement | Context-providing links |
| **link.relation** | 1..1 | string | Link relation type (e.g., self, next, previous) |
| **link.url** | 1..1 | uri | Link URL |
| **entry** | 0..* | BackboneElement | Individual bundle entries |
| **signature** | 0..1 | Signature | Digital signature |

### Entry Structure

**entry** (0..* BackboneElement)

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **link** | 0..* | BackboneElement | Entry-specific context links |
| **fullUrl** | 0..1 | uri | Absolute resource URL; cannot be version-specific; may be empty for POST |
| **resource** | 0..1 | Resource | Actual resource data |
| **search** | 0..1 | BackboneElement | Search metadata (searchset bundles only) |
| **request** | 0..1 | BackboneElement | Transaction/batch execution metadata |
| **response** | 0..1 | BackboneElement | Transaction/batch response metadata |

### Search Metadata (entry.search)

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **mode** | 0..1 | code | match | include | outcome |
| **score** | 0..1 | decimal | Search relevance ranking (0.0 - 1.0) |

**Search mode values**:
- **match**: Primary search results that matched the search criteria
- **include**: Referenced resources from _include/_revinclude parameters
- **outcome**: OperationOutcome conveying search process information/warnings

### Request Metadata (entry.request)

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **method** | 1..1 | code | GET | HEAD | POST | PUT | DELETE | PATCH |
| **url** | 1..1 | uri | Relative entry URL |
| **ifNoneMatch** | 0..1 | string | ETag cache management |
| **ifModifiedSince** | 0..1 | instant | Conditional read timestamp |
| **ifMatch** | 0..1 | string | Update contention control |
| **ifNoneExist** | 0..1 | string | Conditional create query |

### Response Metadata (entry.response)

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **status** | 1..1 | string | HTTP status code (3-digit minimum) |
| **location** | 0..1 | uri | Operation-generated location header |
| **etag** | 0..1 | string | Versioned resource ETag |
| **lastModified** | 0..1 | instant | Server modification timestamp |
| **outcome** | 0..1 | Resource | OperationOutcome hints/warnings |

## Searchset Bundle Specifics

For bundles of type "searchset":

- **total** element should be present when search bundles exist -- indicates total number of matches (not just what is in this page)
- Each entry's **search** element should be present (with mode and optional score)
- Search **mode** differentiates results:
  - `match` = primary search results
  - `include` = referenced resources from _include parameters
  - `outcome` = search process information/warnings (usually OperationOutcome)
- **score** reflects server ranking (0.0 - 1.0 range)
- Pagination is handled via **link** elements with relation "next", "previous", "first", "last"

## Critical Constraints

1. **total** element permitted exclusively in search or history bundles
2. **search** metadata restricted to searchset bundles
3. **request** element mandatory for batch/transaction/history bundles; prohibited otherwise
4. **response** element mandatory for batch-response/transaction-response/history bundles; prohibited elsewhere
5. **fullUrl** uniqueness required -- identical fullUrl values require different meta.versionId (except history bundles)
6. Document bundles require identifier (with system and value), date, and Composition as first entry
7. Message bundles require MessageHeader as first entry
8. Entry must contain either resource or request/response data
9. fullUrl cannot reference version-specific URLs

## Entry Ordering

Entry sequence meaning varies by bundle type:
- For document and message bundles, the first resource is special (Composition or MessageHeader respectively)
- For all bundles, the meaning of the order of entries depends on the bundle type
- In searchset bundles, order typically reflects relevance or natural order

## Bundle Types Summary

| Type | Purpose | Required Elements |
|------|---------|-------------------|
| **searchset** | Search results | total, entry.search |
| **history** | Version history | total, entry.request, entry.response |
| **transaction** | Atomic operations | entry.request |
| **transaction-response** | Transaction results | entry.response |
| **batch** | Independent operations | entry.request |
| **batch-response** | Batch results | entry.response |
| **document** | Clinical document | identifier, first entry = Composition |
| **message** | Message exchange | first entry = MessageHeader |
| **collection** | Arbitrary collection | (none specific) |
