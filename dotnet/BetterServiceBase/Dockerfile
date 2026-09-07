ARG DOTNET_SDK_IMAGE=mcr.microsoft.com/dotnet/sdk:10.0
ARG DOTNET_RUNTIME_IMAGE=mcr.microsoft.com/dotnet/aspnet:10.0

FROM ${DOTNET_SDK_IMAGE} AS build
WORKDIR /src

COPY . .
ARG BSB_VERSION=9.1.11
RUN dotnet restore dotnet/BetterServiceBase/BetterServiceBase.csproj
RUN dotnet publish dotnet/BetterServiceBase/BetterServiceBase.csproj -c Release -o /app/publish /p:UseAppHost=false /p:Version=${BSB_VERSION}

FROM ${DOTNET_RUNTIME_IMAGE}
RUN useradd --create-home --uid 10001 bsb
COPY --from=build /app/publish /opt/bsb
WORKDIR /home/bsb
USER bsb

ENV BSB_MODE=production
ENV BSB_CONTAINER=true

ENTRYPOINT ["dotnet", "/opt/bsb/BetterServiceBase.dll"]
