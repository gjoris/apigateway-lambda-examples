import {CfnOutput, Construct, NestedStack, NestedStackProps, Stack} from '@aws-cdk/core';
import {Deployment, IResource, LambdaIntegration, Method, RestApi, Stage} from "@aws-cdk/aws-apigateway";
import {Code, Function, Runtime} from "@aws-cdk/aws-lambda";

/**
 * This setup will show you how you can pass along subresources from API Gateway to Lambda,
 * to be able to create a nested structure.
 *
 * It uses nested stacks to deploy 2 different stacks: a Pets and a Books stack, deployed in a "sub" subresource.
 *
 * PetsStack:
 *      This can be implemented with CFN ImportValue as well as code based. You need to export/pass the ID of the REST api, along with the ID of the root resource.
 *      It is assumed that you will hard code the path of the subresource. If wanted, this can be exported as well.
 *
 * BooksStack:
 *      This is the code based approach. In a CDK codebase, you can do a pass-by-reference of the IResource that represents the "sub" subresource.
 */

export class MainStack extends Stack {
    constructor(scope: Construct) {
        super(scope, 'integ-restapi-import-RootStack');

        const restApi = new RestApi(this, 'RestApi', {
            deploy: false,
        });
        restApi.root.addMethod('ANY');

        // Add a subresource to the root
        let subResource = restApi.root.addResource("sub");

        const petsStack = new PetsStack(this, {
            restApiId: restApi.restApiId,
            rootResourceId: subResource.resourceId,
            subResource: subResource
        });
        const booksStack = new BooksStack(this, {
            restApiId: restApi.restApiId,
            rootResourceId: subResource.resourceId,
            subResource: subResource
        });
        new DeployStack(this, {
            restApiId: restApi.restApiId,
            methods: [...petsStack.methods, ...booksStack.methods],
        });

        new CfnOutput(this, 'PetsURL', {
            value: `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/sub/pets`,
        });

        new CfnOutput(this, 'BooksURL', {
            value: `https://${restApi.restApiId}.execute-api.${this.region}.amazonaws.com/prod/sub/books`,
        });
    }
}

interface ResourceNestedStackProps extends NestedStackProps {
    readonly restApiId: string;

    readonly rootResourceId: string;

    readonly subResource: IResource;
}

/**
 * The PetsStack will create an API from the restApiId and rootResourceId.
 * It will go on retrieving the subresource based on the path.
 *
 * Using that subresource, it will add the pets resource to the subresource.
 */

class PetsStack extends NestedStack {
    public readonly methods: Method[] = [];

    constructor(scope: Construct, props: ResourceNestedStackProps) {
        super(scope, 'integ-restapi-import-PetsStack', props);

        const api = RestApi.fromRestApiAttributes(this, 'RestApi', {
            restApiId: props.restApiId,
            rootResourceId: props.rootResourceId,
        });

        const hello = new Function(this, 'hello', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'hello.handler',
            code: Code.fromAsset('lambda')
        });

        let subResource = api.root.getResource("sub");

        if (subResource) {
            let method = subResource!.addResource('pets').addMethod('GET', new LambdaIntegration(hello));
            this.methods.push(method);
        }

    }
}

/**
 * The BooksStack will simply retrieve the subresource from the properties passed. This is the pure code-based technique.
 *
 * Using that subresource, it will add the books resource to the subresource.
 */

class BooksStack extends NestedStack {
    public readonly methods: Method[] = [];

    constructor(scope: Construct, props: ResourceNestedStackProps) {
        super(scope, 'integ-restapi-import-BooksStack', props);

        const api = RestApi.fromRestApiAttributes(this, 'RestApi', {
            restApiId: props.restApiId,
            rootResourceId: props.rootResourceId,
        });

        const hello = new Function(this, 'hello', {
            runtime: Runtime.NODEJS_10_X,
            handler: 'hello.handler',
            code: Code.fromAsset('lambda')
        });

        const method = props.subResource.addResource('books').addMethod('GET', new LambdaIntegration(hello));

        this.methods.push(method);

    }
}

interface DeployStackProps extends NestedStackProps {
    readonly restApiId: string;

    readonly methods?: Method[];
}

class DeployStack extends NestedStack {
    constructor(scope: Construct, props: DeployStackProps) {
        super(scope, 'integ-restapi-import-DeployStack', props);

        const deployment = new Deployment(this, 'Deployment', {
            api: RestApi.fromRestApiId(this, 'RestApi', props.restApiId),
        });
        (props.methods ?? []).forEach((method) => deployment.node.addDependency(method));
        new Stage(this, 'Stage', {deployment});
    }
}
