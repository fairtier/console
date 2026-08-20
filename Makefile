# TypeScript protobuf stubs for src/api/gen — generated from the public
# workspace-api protos, pinned to WORKSPACE_API_VERSION. Regenerate with
# `make proto` (or `proto-workspace`); CI drift-checks that the committed
# stubs match the pinned tag.
#
# The input is passed as a module root, not a proto/ subdirectory, so buf
# reads the repo's own buf.yaml — the protos import each other by bare
# filename and only resolve against their declared module.
#
# protoc-gen-es is pinned in buf.gen.yaml; keep it in step with
# @bufbuild/protobuf in package.json — an unpinned plugin rewrites every
# stub's header and fails the drift check spuriously.

WORKSPACE_API_VERSION := v0.17.0
WORKSPACE_API_REPO := https://github.com/fairtier/workspace-api

.PHONY: default proto proto-workspace

default: proto

proto: proto-workspace

proto-workspace:
	rm -rf .workspace-api-src
	git clone --quiet --depth 1 --branch $(WORKSPACE_API_VERSION) $(WORKSPACE_API_REPO) .workspace-api-src
	rm -f src/api/gen/*_pb.ts
	buf generate --template buf.gen.yaml .workspace-api-src
	rm -rf .workspace-api-src
